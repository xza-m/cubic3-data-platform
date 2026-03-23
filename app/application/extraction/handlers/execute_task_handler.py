"""
执行任务命令处理器
"""
from app.application.extraction.commands.execute_task import ExecuteTaskCommand
from app.domain.entities.extraction_run import ExtractionRun
from app.domain.ports.repositories.extraction_repository import IExtractionRepository
from app.shared.exceptions import TaskNotFoundError
from app.shared.enums import TaskStatus
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ExecuteTaskHandler:
    """
    执行任务命令处理器
    
    职责：
    1. 验证任务存在性和可执行性
    2. 创建执行记录
    3. 将任务提交到 RQ 队列（异步执行）
    4. 返回执行记录
    
    注意：实际的查询执行在 RQ Worker 中进行（见 Phase 4）
    """
    
    def __init__(
        self,
        extraction_repository: IExtractionRepository,
        task_queue_manager=None,  # 延后注入（Phase 4 实现）
        event_bus=None
    ):
        self._extraction_repo = extraction_repository
        self._task_queue = task_queue_manager
        self._event_bus = event_bus
    
    def handle(self, command: ExecuteTaskCommand) -> dict:
        """
        处理执行任务命令
        
        Args:
            command: 执行任务命令
        
        Returns:
            执行结果，包含：
            {
                'run_id': int,
                'status': str,
                'message': str,
                'job_id': str  # RQ Job ID
            }
        
        Raises:
            TaskNotFoundError: 任务不存在
            TaskNotActiveError: 任务未激活
        """
        logger.info(
            f"Executing extraction task",
            task_id=command.task_id,
            triggered_by=command.triggered_by,
            trace_id=command.trace_id
        )
        
        # 1. 加载任务
        task = self._extraction_repo.find_by_id(command.task_id)
        if not task:
            raise TaskNotFoundError(command.task_id)
        
        # 2. 创建执行记录（业务方法）
        run = task.execute(triggered_by=command.triggered_by)
        
        # 3. 记录领域事件
        from app.domain.events.extraction_events import TaskExecuted
        task.record_event(
            TaskExecuted(
                task_id=task.id,
                run_id=run.id if run.id else 0,
                executor_id=command.triggered_by,
                user_id=command.triggered_by
            )
        )
        
        # 4. 持久化执行记录
        run = self._extraction_repo.save_run(run)
        self._extraction_repo.commit()
        
        # 5. 发布事件
        if self._event_bus:
            events = task.clear_events()
            self._event_bus.publish_batch(events)
        
        logger.info(
            f"Execution record created",
            run_id=run.id,
            task_id=command.task_id
        )
        
        # 6. 提交到 RQ 队列（异步执行）
        job_id = None
        if self._task_queue:
            job_id = self._task_queue.enqueue_extraction_task(run.id)
            logger.info(
                f"Task enqueued to RQ",
                run_id=run.id,
                job_id=job_id
            )
        else:
            logger.warning("Task queue not configured, execution will not proceed")
        
        return {
            'run_id': run.id,
            'status': TaskStatus.PENDING.value,
            'message': 'Task queued for execution',
            'job_id': job_id
        }
