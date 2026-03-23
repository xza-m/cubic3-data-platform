"""
智能对话实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List, Optional
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, ForeignKey
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db


class Conversation(db.Model):
    """
    对话实体
    
    职责：
    1. 管理对话会话
    2. 关联数据集和用户
    3. 记录对话元数据
    """
    __tablename__ = 'conversations'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    title = Column(String(200), nullable=False)
    
    # 关联数据集
    dataset_id = Column(BigInteger, ForeignKey('datasets.id', ondelete='CASCADE'))
    
    # 元数据
    user_id = Column(String(50), nullable=False)
    description = Column(Text)
    
    # 对话上下文（存储对话状态、历史摘要等）
    context = Column(JsonType, default={})
    
    # 审计字段
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    is_deleted = Column(Boolean, default=False)
    
    # 关系
    dataset = relationship('Dataset', backref='conversations')
    messages = relationship('Message', back_populates='conversation', cascade='all, delete-orphan', lazy='dynamic', order_by='Message.created_at')
    
    # ========================================================================
    # 领域事件方法
    # ========================================================================
    
    def record_event(self, event):
        """记录领域事件"""
        if not hasattr(self, '_domain_events'):
            self._domain_events = []
        self._domain_events.append(event)
    
    def clear_events(self) -> List:
        """清空并返回事件"""
        if not hasattr(self, '_domain_events'):
            self._domain_events = []
        events = self._domain_events.copy()
        self._domain_events.clear()
        return events
    
    # ========================================================================
    # 业务方法
    # ========================================================================
    
    def update_title(self, title: str):
        """更新对话标题"""
        self.title = title
        self.updated_at = utcnow()
    
    def update_context(self, context: dict):
        """更新对话上下文"""
        self.context = context
        self.updated_at = utcnow()
    
    def soft_delete(self):
        """软删除对话"""
        self.is_deleted = True
        self.updated_at = utcnow()
    
    def get_recent_messages(self, limit: int = 10) -> List['Message']:
        """获取最近的消息"""
        return self.messages.order_by(db.desc('created_at')).limit(limit).all()
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_messages: bool = False):
        """
        转换为字典
        
        Args:
            include_messages: 是否包含消息列表
        
        Returns:
            字典表示
        """
        data = {
            'id': self.id,
            'title': self.title,
            'dataset_id': self.dataset_id,
            'dataset_name': self.dataset.dataset_name if self.dataset else None,
            'user_id': self.user_id,
            'description': self.description,
            'context': self.context,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'message_count': self.messages.count()
        }
        
        if include_messages:
            data['messages'] = [m.to_dict() for m in self.messages.all()]
        
        return data
    
    def __repr__(self):
        return f'<Conversation {self.id}: {self.title}>'


class Message(db.Model):
    """
    消息实体
    
    职责：
    1. 存储对话消息
    2. 区分用户消息和AI回复
    3. 存储SQL、数据和可视化结果
    """
    __tablename__ = 'messages'
    __table_args__ = {'extend_existing': True}
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    conversation_id = Column(BigInteger, ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False)
    
    # 消息内容
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    
    # SQL和数据（AI回复时可选）
    generated_sql = Column(Text)
    query_result = Column(JsonType)  # 存储查询结果
    
    # 可视化配置（AI回复时可选）
    visualization_config = Column(JsonType)  # 图表类型、配置等
    
    # 错误信息
    error = Column(Text)
    
    # 审计字段
    created_at = Column(DateTime, default=utcnow)
    
    # 关系
    conversation = relationship('Conversation', back_populates='messages')
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'generated_sql': self.generated_sql,
            'query_result': self.query_result,
            'visualization_config': self.visualization_config,
            'error': self.error,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Message {self.id}: {self.role}>'
