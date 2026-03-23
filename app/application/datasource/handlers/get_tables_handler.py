"""
获取表列表处理器（带缓存）
"""
from typing import List, Dict, Any, Tuple
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.queries.get_tables import GetTablesQuery
from app.infrastructure.cache.decorators import cache_query, invalidate_cache
from app.infrastructure.cache.table_cache_service import TableCacheService
from app.shared.exceptions import ApplicationException


class GetTablesHandler:
    """获取表列表处理器"""
    
    def __init__(self, repository: IDatasourceRepository, table_cache_service: TableCacheService = None):
        """
        初始化
        
        Args:
            repository: 数据源仓储
            table_cache_service: 表缓存服务（可选，通过 DI 注入）
        """
        self.repository = repository
        self.table_cache_service = table_cache_service
    
    def handle(self, query: GetTablesQuery) -> Tuple[List[Dict[str, Any]], bool]:
        """
        处理获取表列表查询（异步，带缓存）
        
        Args:
            query: 查询对象
        
        Returns:
            (表列表, 是否来自缓存)
        
        Raises:
            ApplicationException: 数据源不存在或查询失败
        """
        # 1. 查找数据源
        datasource = self.repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        # 2. 如果强制刷新，清除缓存
        if query.force_refresh:
            cache_key = f"tables:{query.datasource_id}:{query.database}"
            invalidate_cache(cache_key)
        
        # 3. 通过注入的缓存服务获取表列表
        if self.table_cache_service is None:
            from app.di.container import get_container
            self.table_cache_service = get_container().table_cache_service()
        
        tables, from_cache = self.table_cache_service.get_cached_tables(
            query.datasource_id,
            query.database,
            query.force_refresh
        )
        
        return tables, from_cache
