"""
获取数据集详情处理器
"""
from app.domain.entities.dataset import Dataset
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.application.dataset.queries.get_dataset import GetDatasetQuery
from app.shared.exceptions import ApplicationException


class GetDatasetHandler:
    """获取数据集详情处理器"""
    
    def __init__(self, repository: IDatasetRepository):
        self.repository = repository
    
    def handle(self, query: GetDatasetQuery) -> Dataset:
        """处理获取详情查询"""
        dataset = self.repository.find_by_id(query.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {query.dataset_id}")
        
        return dataset
