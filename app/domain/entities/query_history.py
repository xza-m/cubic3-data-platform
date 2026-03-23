"""
查询执行历史实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy import Column, BigInteger, String, DateTime, Text, Integer, ForeignKey
from app.extensions import db


class QueryHistory(db.Model):
    """
    查询执行历史
    
    职责：
    1. 记录查询执行记录
    2. 保存执行结果统计
    3. 记录错误信息
    """
    __tablename__ = 'query_histories'
    __table_args__ = {'extend_existing': True}
    
    id = Column(BigInteger, primary_key=True)
    query_id = Column(BigInteger, ForeignKey('queries.id', ondelete='SET NULL'), nullable=True, index=True)  # 临时查询为 NULL
    source_id = Column(BigInteger, ForeignKey('data_sources.id', ondelete='SET NULL'), nullable=True, index=True)
    
    # 查询内容
    sql_query = Column(Text, nullable=False)
    
    # 执行结果
    status = Column(String(20), nullable=False, index=True)  # success/failed/timeout
    result_rows = Column(Integer, default=0)
    execution_time_ms = Column(Integer)
    error_message = Column(Text, nullable=True)
    
    # 审计字段
    executed_by = Column(String(100), nullable=False, index=True)
    executed_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    
    def __repr__(self):
        return f"<QueryHistory id={self.id} status={self.status} rows={self.result_rows}>"
