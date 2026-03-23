"""
删除任务命令处理器
"""
from app.application.extraction.commands.delete_task import DeleteTaskCommand
from app.domain.ports.repositories.extraction_repository import IExtractionRepository
from app.shared.exceptions import TaskNotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class DeleteTaskHandler:
    """
    删除任务命令处理器
    
    职责：
    1. 验证任务存在性
    2. 删除任务
    3. 发布删除事件
    """
    
    def __init__(
        self,
        extraction_repository: IExtractionRepository,
        event_bus=None
    ):
        self._extraction_repo = extraction_repository
        self._event_bus = event_bus
    
    def handle(self, command: DeleteTaskCommand) -> bool:
        """
        处理删除任务命令
        
        Args:
            command: 删除任务命令
        
        Returns:
            是否删除成功
        
        Raises:
            TaskNotFoundError: 任务不存在
        """
        logger.info(
            f"Deleting extraction task",
            task_id=command.task_id,
            deleted_by=command.deleted_by
        )
        
        # 1. 验证任务存在
        task = self._extraction_repo.find_by_id(command.task_id)
        if not task:
            raise TaskNotFoundError(command.task_id)
        
        # 2. 记录领域事件
        from app.domain.events.extraction_events import TaskDeleted
        task.record_event(
            TaskDeleted(
                task_id=task.id,
                task_name=task.task_name,
                deleted_by=command.deleted_by,
                user_id=command.deleted_by
            )
        )
        
        # 3. 删除任务
        success = self._extraction_repo.delete(command.task_id)
        if success:
            self._extraction_repo.commit()
        
        # 4. 发布事件
        if self._event_bus and success:
            events = task.clear_events()
            self._event_bus.publish_batch(events)
        
        logger.info(
            f"Task deleted successfully",
            task_id=command.task_id,
            success=success
        )
        
        return success
