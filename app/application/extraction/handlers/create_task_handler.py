"""
创建任务命令处理器
"""
import uuid
from app.application.extraction.commands.create_task import CreateTaskCommand
from app.domain.entities.extraction_task import ExtractionTask
from app.domain.ports.repositories.extraction_repository import IExtractionRepository
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.services.sql_generator import SQLGeneratorService
from app.domain.services.permission_checker import PermissionCheckerService
from app.shared.exceptions import DatasetNotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class CreateTaskHandler:
    """
    创建任务命令处理器
    
    职责：
    1. 验证数据集存在性
    2. 验证用户权限
    3. 生成 SQL 模板
    4. 创建任务实体
    5. 持久化任务
    """
    
    def __init__(
        self,
        extraction_repository: IExtractionRepository,
        dataset_repository: IDatasetRepository,
        event_bus=None,
        sql_generator: SQLGeneratorService = None,
        permission_checker: PermissionCheckerService = None
    ):
        self._extraction_repo = extraction_repository
        self._dataset_repo = dataset_repository
        self._event_bus = event_bus
        self._sql_generator = sql_generator
        self._permission_checker = permission_checker
    
    def handle(self, command: CreateTaskCommand) -> ExtractionTask:
        """
        处理创建任务命令
        
        Args:
            command: 创建任务命令
        
        Returns:
            创建的任务实体
        
        Raises:
            DatasetNotFoundError: 数据集不存在
            AuthorizationError: 用户无权限
            SQLGenerationError: SQL 生成失败
        """
        logger.info(
            f"Creating extraction task",
            task_name=command.task_name,
            dataset_id=command.dataset_id,
            created_by=command.created_by
        )
        
        # 1. 加载数据集
        dataset = self._dataset_repo.find_by_id(command.dataset_id)
        if not dataset:
            raise DatasetNotFoundError(command.dataset_id)
        
        # 2. 验证权限（列级权限）
        self._permission_checker.check_field_access(
            user_id=command.created_by,
            dataset=dataset,
            field_names=command.select_fields
        )
        
        # 3. 生成 SQL 模板
        sql_template = self._sql_generator.generate_sql(
            dataset=dataset,
            select_fields=command.select_fields,
            filter_conditions=command.filter_conditions,
            limit=command.row_limit,
            apply_masking=True  # 应用脱敏规则
        )
        
        # 4. 创建任务实体
        task = ExtractionTask(
            task_name=command.task_name,
            task_code=self._generate_task_code(dataset.dataset_code),
            dataset_id=command.dataset_id,
            select_fields=command.select_fields,
            filter_conditions=command.filter_conditions,
            sql_template=sql_template,
            row_limit=command.row_limit,
            task_type=command.task_type,
            schedule_config=command.schedule_config,
            subscription_config=command.subscription_config,
            created_by=command.created_by
        )
        
        # 5. 验证任务（业务规则）
        task.validate_fields()
        
        # 6. 记录领域事件
        from app.domain.events.extraction_events import TaskCreated
        task.record_event(
            TaskCreated(
                task_id=task.id,
                task_name=task.task_name,
                dataset_id=task.dataset_id,
                created_by=command.created_by,
                user_id=command.created_by
            )
        )
        
        # 7. 持久化
        task = self._extraction_repo.save(task)
        self._extraction_repo.commit()
        
        # 8. 发布事件
        if self._event_bus:
            events = task.clear_events()
            self._event_bus.publish_batch(events)
        
        logger.info(
            f"Task created successfully",
            task_id=task.id,
            task_code=task.task_code
        )
        
        return task
    
    def _generate_task_code(self, dataset_code: str) -> str:
        """
        生成任务编码
        
        格式：task_{dataset_code}_{uuid}
        
        Args:
            dataset_code: 数据集编码
        
        Returns:
            任务编码
        """
        return f"task_{dataset_code}_{uuid.uuid4().hex[:8]}"
