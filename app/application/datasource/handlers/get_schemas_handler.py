"""
获取Schema列表处理器
"""
from typing import List
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.queries.get_schemas import GetSchemasQuery
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException


class GetSchemasHandler:
    """获取Schema列表处理器"""
    
    def __init__(self, repository: IDatasourceRepository):
        """
        初始化
        
        Args:
            repository: 数据源仓储
        """
        self.repository = repository
    
    def handle(self, query: GetSchemasQuery) -> List[str]:
        """
        处理获取Schema列表查询
        
        Args:
            query: 查询对象
        
        Returns:
            Schema名称列表
        
        Raises:
            ApplicationException: 数据源不存在或连接失败
        """
        # 1. 查找数据源
        datasource = self.repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        # 2. 创建适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 3. 获取Schema列表
        try:
            schemas = adapter.list_schemas(query.database)
            return schemas
        except Exception as e:
            raise ApplicationException(f"获取Schema列表失败: {str(e)}")
