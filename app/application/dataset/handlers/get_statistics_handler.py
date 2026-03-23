"""
获取数据集统计信息处理器
"""
from typing import Dict, Any
from sqlalchemy import select, func, Engine
from app.domain.entities.dataset import Dataset
from app.application.dataset.queries.get_statistics import GetStatisticsQuery


class GetStatisticsHandler:
    """获取数据集统计信息处理器（CQRS读操作）"""
    
    def __init__(self, engine: Engine):
        self.engine = engine
    
    def handle(self, query: GetStatisticsQuery) -> Dict[str, Any]:
        """处理统计查询"""
        with self.engine.connect() as conn:
            # 总数（排除已删除）
            total_stmt = select(func.count()).select_from(Dataset).where(Dataset.is_deleted == False)
            total = conn.execute(total_stmt).scalar()
            
            # 按同步状态统计（排除已删除）
            by_status_stmt = select(
                Dataset.sync_status,
                func.count(Dataset.id).label('count')
            ).where(Dataset.is_deleted == False).group_by(Dataset.sync_status)
            
            by_status_result = conn.execute(by_status_stmt)
            by_status = {row.sync_status: row.count for row in by_status_result}
            
            # 按数据源统计（排除已删除）
            by_source_stmt = select(
                Dataset.source_id,
                func.count(Dataset.id).label('count')
            ).where(Dataset.is_deleted == False).group_by(Dataset.source_id)
            
            by_source_result = conn.execute(by_source_stmt)
            by_source = {row.source_id: row.count for row in by_source_result}
            
            # 按负责人统计（排除已删除）
            by_owner_stmt = select(
                Dataset.owner,
                func.count(Dataset.id).label('count')
            ).where(
                Dataset.owner.isnot(None),
                Dataset.is_deleted == False
            ).group_by(Dataset.owner)
            
            by_owner_result = conn.execute(by_owner_stmt)
            by_owner = {row.owner: row.count for row in by_owner_result}
            
            return {
                'total': total,
                'active': by_status.get('active', 0),
                'syncing': by_status.get('syncing', 0),
                'synced': by_status.get('synced', 0),
                'failed': by_status.get('failed', 0),
                'pending': by_status.get('pending', 0),
                'by_source': by_source,
                'by_owner': by_owner
            }
