"""
查询文件夹实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey
from app.extensions import db


class QueryFolder(db.Model):
    """
    查询文件夹
    
    职责：
    1. 组织查询分类
    2. 支持层级结构
    """
    __tablename__ = 'query_folders'
    __table_args__ = {'extend_existing': True}
    
    id = Column(BigInteger, primary_key=True)
    folder_name = Column(String(100), nullable=False)
    parent_id = Column(BigInteger, ForeignKey('query_folders.id', ondelete='CASCADE'), nullable=True, index=True)
    
    # 审计字段
    created_by = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    
    def __repr__(self):
        return f"<QueryFolder id={self.id} name={self.folder_name}>"
