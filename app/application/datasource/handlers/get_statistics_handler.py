"""
获取数据源统计信息处理器
"""
from typing import Dict, Any
from sqlalchemy import select, func, Engine, case
from app.domain.entities.data_source import DataSource
from app.application.datasource.queries.get_statistics import GetStatisticsQuery


class GetStatisticsHandler:
    """获取数据源统计信息处理器（CQRS读操作）"""
    
    def __init__(self, engine: Engine):
        """
        初始化
        
        Args:
            engine: SQLAlchemy Engine
        """
        self.engine = engine
    
    def handle(self, query: GetStatisticsQuery) -> Dict[str, Any]:
        """
        处理获取统计信息查询
        
        Args:
            query: 查询对象
        
        Returns:
            统计信息字典
        """
        with self.engine.connect() as conn:
            # 总数
            total_stmt = select(func.count()).select_from(DataSource)
            total = conn.execute(total_stmt).scalar()
            
            # 激活数
            active_stmt = select(func.count()).select_from(DataSource).where(
                DataSource.is_active == True
            )
            active = conn.execute(active_stmt).scalar()
            
            # 已连接数
            connected_stmt = select(func.count()).select_from(DataSource).where(
                DataSource.connection_status == 'connected'
            )
            connected = conn.execute(connected_stmt).scalar()
            
            # 按类型统计
            by_type_stmt = select(
                DataSource.source_type,
                func.count(DataSource.id).label('count')
            ).group_by(DataSource.source_type)
            
            by_type_result = conn.execute(by_type_stmt)
            by_type = {row.source_type: row.count for row in by_type_result}
            
            return {
                'total': total,
                'active': active,
                'connected': connected,
                'inactive': total - active,
                'by_type': by_type
            }
