"""
更新任务命令处理器
"""
from app.application.extraction.commands.update_task import UpdateTaskCommand
from app.domain.entities.extraction_task import ExtractionTask
from app.domain.ports.repositories.extraction_repository import IExtractionRepository
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.services.sql_generator import SQLGeneratorService
from app.domain.services.permission_checker import PermissionCheckerService
from app.shared.exceptions import TaskNotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class UpdateTaskHandler:
    """
    更新任务命令处理器
    
    职责：
    1. 验证任务存在性
    2. 验证用户权限（如果更新字段）
    3. 重新生成 SQL（如果更新查询配置）
    4. 更新任务实体
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
    
    def handle(self, command: UpdateTaskCommand) -> ExtractionTask:
        """
        处理更新任务命令
        
        Args:
            command: 更新任务命令
        
        Returns:
            更新后的任务实体
        
        Raises:
            TaskNotFoundError: 任务不存在
            AuthorizationError: 用户无权限
            SQLGenerationError: SQL 生成失败
        """
        logger.info(
            f"Updating extraction task",
            task_id=command.task_id,
            updated_by=command.updated_by
        )
        
        # 1. 加载任务
        task = self._extraction_repo.find_by_id(command.task_id)
        if not task:
            raise TaskNotFoundError(command.task_id)
        
        # 2. 加载数据集（用于权限检查和 SQL 生成）
        dataset = self._dataset_repo.find_by_id(task.dataset_id)
        
        # 3. 检查是否需要重新生成 SQL
        need_regenerate_sql = any([
            command.select_fields is not None,
            command.filter_conditions is not None,
            command.row_limit is not None
        ])
        
        # 4. 更新字段
        if command.task_name is not None:
            task.task_name = command.task_name
        
        if command.select_fields is not None:
            # 验证字段权限
            self._permission_checker.check_field_access(
                user_id=command.updated_by,
                dataset=dataset,
                field_names=command.select_fields
            )
            task.select_fields = command.select_fields
        
        if command.filter_conditions is not None:
            task.filter_conditions = command.filter_conditions
        
        if command.row_limit is not None:
            task.row_limit = command.row_limit
        
        if command.schedule_config is not None:
            task.schedule_config = command.schedule_config
        
        if command.subscription_config is not None:
            task.subscription_config = command.subscription_config
        
        if command.is_active is not None:
            task.is_active = command.is_active
        
        # 5. 重新生成 SQL（如果需要）
        if need_regenerate_sql:
            sql_template = self._sql_generator.generate_sql(
                dataset=dataset,
                select_fields=task.select_fields,
                filter_conditions=task.filter_conditions,
                limit=task.row_limit,
                apply_masking=True
            )
            task.sql_template = sql_template
        
        # 6. 更新 updated_at 时间戳
        from datetime import datetime
        task.updated_at = datetime.now()
        
        # 7. 验证任务（业务规则）
        task.validate_fields()
        
        # 8. 记录领域事件
        from app.domain.events.extraction_events import TaskUpdated
        task.record_event(
            TaskUpdated(
                task_id=task.id,
                task_name=task.task_name,
                updated_by=command.updated_by,
                user_id=command.updated_by
            )
        )
        
        # 9. 持久化
        task = self._extraction_repo.save(task)
        self._extraction_repo.commit()
        
        # 10. 发布事件
        if self._event_bus:
            events = task.clear_events()
            self._event_bus.publish_batch(events)
        
        logger.info(
            f"Task updated successfully",
            task_id=task.id
        )
        
        return task
