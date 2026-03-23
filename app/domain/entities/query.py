"""
查询实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, Integer, ForeignKey
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db


class Query(db.Model):
    """
    用户保存的查询
    
    职责：
    1. 管理查询元数据
    2. 关联数据源和文件夹
    3. 记录查询执行统计
    4. 支持收藏和模板功能
    """
    __tablename__ = 'queries'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    query_code = Column(String(100), unique=True, nullable=False, index=True)
    query_name = Column(String(200), nullable=False)
    
    # 查询内容
    source_id = Column(BigInteger, ForeignKey('data_sources.id', ondelete='SET NULL'), nullable=True, index=True)
    sql_query = Column(Text, nullable=False)
    
    # 分类与标签
    folder_id = Column(BigInteger, ForeignKey('query_folders.id', ondelete='SET NULL'), nullable=True, index=True)
    tags = Column(JsonType, default=list)  # ["用户分析", "日报"]
    
    # 元数据
    description = Column(Text)
    is_favorite = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False, index=True)
    execute_count = Column(Integer, default=0)
    
    # 审计字段
    created_by = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    last_executed_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    # ========================================================================
    # 关系定义
    # ========================================================================
    
    source = relationship('DataSource', foreign_keys=[source_id], backref='queries')
    folder = relationship('QueryFolder', foreign_keys=[folder_id], backref='queries')
    
    # ========================================================================
    # 领域方法
    # ========================================================================
    
    def mark_executed(self):
        """标记查询被执行"""
        self.execute_count += 1
        self.last_executed_at = utcnow()
    
    def toggle_favorite(self):
        """切换收藏状态"""
        self.is_favorite = not self.is_favorite
    
    def soft_delete(self):
        """软删除"""
        self.is_deleted = True
        self.deleted_at = utcnow()
    
    # ========================================================================
    # 领域事件
    # ========================================================================
    
    def add_domain_event(self, event):
        """添加领域事件"""
        self._domain_events.append(event)
    
    def clear_domain_events(self):
        """清除领域事件"""
        self._domain_events.clear()
    
    def get_domain_events(self) -> List:
        """获取领域事件"""
        return self._domain_events.copy()
    
    def __repr__(self):
        return f"<Query id={self.id} code={self.query_code} name={self.query_name}>"
