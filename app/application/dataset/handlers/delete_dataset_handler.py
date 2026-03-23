"""
删除数据集处理器
"""
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.application.dataset.commands.delete_dataset import DeleteDatasetCommand
from app.infrastructure.events.event_bus import EventBus
from app.domain.events.dataset_events import DatasetDeleted
from app.shared.exceptions import ApplicationException


class DeleteDatasetHandler:
    """删除数据集处理器"""
    
    def __init__(self, repository: IDatasetRepository, event_bus: EventBus):
        self.repository = repository
        self.event_bus = event_bus
    
    def handle(self, command: DeleteDatasetCommand) -> None:
        """处理删除命令（软删除）"""
        dataset = self.repository.find_by_id(command.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {command.dataset_id}")
        
        # 记录领域事件
        dataset.record_event(
            DatasetDeleted(
                dataset_id=dataset.id,
                dataset_code=dataset.dataset_code,
                deleted_by=command.deleted_by if hasattr(command, 'deleted_by') else 'system',
                user_id=command.deleted_by if hasattr(command, 'deleted_by') else None
            )
        )
        
        # 发布事件
        events = dataset.clear_events()
        self.event_bus.publish_batch(events)
        
        # 软删除
        dataset.soft_delete()
        self.repository.save(dataset)
        self.repository.commit()