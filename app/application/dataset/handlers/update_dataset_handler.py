"""
更新数据集处理器
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from app.domain.entities.dataset import Dataset
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.application.dataset.commands.update_dataset import UpdateDatasetCommand
from app.shared.exceptions import ApplicationException


class UpdateDatasetHandler:
    """更新数据集处理器"""
    
    def __init__(self, repository: IDatasetRepository):
        self.repository = repository
    
    def handle(self, command: UpdateDatasetCommand) -> Dataset:
        """处理更新命令"""
        dataset = self.repository.find_by_id(command.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {command.dataset_id}")
        
        if command.dataset_name is not None:
            dataset.dataset_name = command.dataset_name
        if command.description is not None:
            dataset.description = command.description
        if command.owner is not None:
            dataset.owner = command.owner
        
        dataset.updated_at = utcnow()
        
        return self.repository.save(dataset)
