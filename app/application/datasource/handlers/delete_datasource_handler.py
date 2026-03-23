"""
删除数据源处理器
"""
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.commands.delete_datasource import DeleteDatasourceCommand
from app.infrastructure.events.event_bus import EventBus
from app.domain.events.datasource_events import DatasourceDeleted
from app.shared.exceptions import ApplicationException


class DeleteDatasourceHandler:
    """删除数据源处理器"""
    
    def __init__(self, repository: IDatasourceRepository, event_bus: EventBus):
        """
        初始化
        
        Args:
            repository: 数据源仓储
            event_bus: 事件总线
        """
        self.repository = repository
        self.event_bus = event_bus
    
    def handle(self, command: DeleteDatasourceCommand) -> None:
        """
        处理删除数据源命令
        
        Args:
            command: 删除命令
        
        Raises:
            ApplicationException: 数据源不存在或有关联数据
        """
        # 1. 查找数据源
        datasource = self.repository.find_by_id(command.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {command.datasource_id}")
        
        # 2. 检查是否有关联的数据集
        if datasource.datasets:
            raise ApplicationException(
                f"无法删除数据源，存在 {len(datasource.datasets)} 个关联的数据集"
            )
        
        # 3. 记录领域事件
        datasource.record_event(
            DatasourceDeleted(
                datasource_id=datasource.id,
                name=datasource.name,
                deleted_by=command.deleted_by if hasattr(command, 'deleted_by') else 'system',
                user_id=command.deleted_by if hasattr(command, 'deleted_by') else None
            )
        )
        
        # 4. 发布事件（删除前）
        events = datasource.clear_events()
        self.event_bus.publish_batch(events)
        
        # 5. 删除
        self.repository.delete(datasource)
