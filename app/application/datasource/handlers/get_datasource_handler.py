"""
获取数据源详情处理器
"""
from app.domain.entities.data_source import DataSource
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.queries.get_datasource import GetDatasourceQuery
from app.shared.exceptions import ApplicationException


class GetDatasourceHandler:
    """获取数据源详情处理器"""
    
    def __init__(self, repository: IDatasourceRepository):
        """
        初始化
        
        Args:
            repository: 数据源仓储
        """
        self.repository = repository
    
    def handle(self, query: GetDatasourceQuery) -> DataSource:
        """
        处理获取详情查询
        
        Args:
            query: 查询对象
        
        Returns:
            数据源实体
        
        Raises:
            ApplicationException: 数据源不存在
        """
        datasource = self.repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        return datasource
