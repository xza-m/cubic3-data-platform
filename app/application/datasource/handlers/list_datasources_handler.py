"""
查询数据源列表处理器（使用SQLAlchemy Core）
"""
from typing import Dict, Any
from sqlalchemy import select, func, or_, Engine
from app.domain.entities.data_source import DataSource
from app.application.datasource.queries.list_datasources import ListDatasourcesQuery


class ListDatasourcesHandler:
    """查询数据源列表处理器（CQRS读操作）"""
    
    def __init__(self, engine: Engine):
        """
        初始化
        
        Args:
            engine: SQLAlchemy Engine
        """
        self.engine = engine
    
    def handle(self, query: ListDatasourcesQuery) -> Dict[str, Any]:
        """
        处理列表查询
        
        Args:
            query: 查询对象
        
        Returns:
            分页结果字典
        """
        # 构建查询
        stmt = select(DataSource)
        
        # 筛选条件
        if query.source_type:
            stmt = stmt.where(DataSource.source_type == query.source_type)
        
        if query.is_active is not None:
            stmt = stmt.where(DataSource.is_active == query.is_active)
        
        if query.search:
            search_pattern = f'%{query.search}%'
            stmt = stmt.where(
                or_(
                    DataSource.name.ilike(search_pattern),
                    DataSource.description.ilike(search_pattern)
                )
            )
        
        # 计算总数
        count_stmt = select(func.count()).select_from(stmt.subquery())
        with self.engine.connect() as conn:
            total = conn.execute(count_stmt).scalar()
        
        # 排序和分页
        stmt = stmt.order_by(DataSource.created_at.desc())
        offset = (query.page - 1) * query.page_size
        stmt = stmt.offset(offset).limit(query.page_size)
        
        # 执行查询
        with self.engine.connect() as conn:
            result = conn.execute(stmt)
            items = [DataSource(**dict(row._mapping)) for row in result]
        
        # 计算总页数
        total_pages = (total + query.page_size - 1) // query.page_size
        
        return {
            'items': items,
            'total': total,
            'page': query.page,
            'page_size': query.page_size,
            'total_pages': total_pages
        }
