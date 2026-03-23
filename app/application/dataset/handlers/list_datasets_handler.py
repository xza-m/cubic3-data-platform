"""
查询数据集列表处理器
"""
from typing import Dict, Any
from sqlalchemy import select, func, or_, Engine
from sqlalchemy.orm import Session
from app.domain.entities.dataset import Dataset
from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset_field import DatasetField
from app.application.dataset.queries.list_datasets import ListDatasetsQuery


class ListDatasetsHandler:
    """查询数据集列表处理器（CQRS读操作）"""
    
    def __init__(self, engine: Engine):
        self.engine = engine
    
    def handle(self, query: ListDatasetsQuery) -> Dict[str, Any]:
        """处理列表查询"""
        # 字段数量子查询
        field_count_subquery = (
            select(
                DatasetField.dataset_id,
                func.count(DatasetField.id).label('field_count')
            )
            .group_by(DatasetField.dataset_id)
            .subquery()
        )

        # 构建查询（排除软删除的记录）
        stmt = (
            select(
                Dataset,
                DataSource.source_type.label('source_type'),
                field_count_subquery.c.field_count
            )
            .select_from(Dataset)
            .outerjoin(DataSource, Dataset.source_id == DataSource.id)
            .outerjoin(field_count_subquery, field_count_subquery.c.dataset_id == Dataset.id)
            .where(Dataset.is_deleted == False)
        )
        
        # 筛选条件
        if query.source_id:
            stmt = stmt.where(Dataset.source_id == query.source_id)
        
        if query.owner:
            stmt = stmt.where(Dataset.owner == query.owner)
        
        if query.search:
            search_pattern = f'%{query.search}%'
            stmt = stmt.where(
                or_(
                    Dataset.dataset_name.ilike(search_pattern),
                    Dataset.dataset_code.ilike(search_pattern),
                    Dataset.description.ilike(search_pattern)
                )
            )
        
        # 计算总数
        count_stmt = select(func.count()).select_from(stmt.subquery())
        with Session(self.engine) as session:
            total = session.execute(count_stmt).scalar()
        
        # 排序和分页
        stmt = stmt.order_by(Dataset.created_at.desc())
        offset = (query.page - 1) * query.page_size
        stmt = stmt.offset(offset).limit(query.page_size)
        
        # 执行查询
        with Session(self.engine) as session:
            result = session.execute(stmt).all()
            items = []
            for row in result:
                dataset = row[0]
                dataset.source_type = row.source_type
                dataset.field_count = row.field_count or 0
                items.append(dataset)
        
        # 计算总页数
        total_pages = (total + query.page_size - 1) // query.page_size
        
        return {
            'items': items,
            'total': total,
            'page': query.page,
            'page_size': query.page_size,
            'total_pages': total_pages
        }
