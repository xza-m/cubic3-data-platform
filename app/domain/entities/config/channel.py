"""
渠道实体

表示推送渠道配置，如飞书群、邮件、Webhook等
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from enum import Enum
from typing import Dict, Any, List, Optional
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db


class ChannelType(str, Enum):
    """渠道类型"""
    FEISHU = "feishu"      # 飞书群/机器人
    EMAIL = "email"        # 邮件
    WEBHOOK = "webhook"    # Webhook
    OSS = "oss"            # OSS存储


class Channel(db.Model):
    """
    推送渠道实体
    
    职责：
    1. 管理渠道配置（飞书群、邮件、Webhook等）
    2. 验证渠道配置
    3. 提供渠道级别的业务逻辑
    """
    __tablename__ = 'channels'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    name = Column(String(100), nullable=False)
    channel_type = Column(String(20), nullable=False)
    description = Column(Text)
    
    # 渠道配置（JSONB，结构根据类型不同）
    # feishu: { chat_id, webhook_url, message_template }
    # email: { recipients, subject_template, body_template }
    # webhook: { url, method, headers, body_template }
    # oss: { bucket, path_template, filename_template }
    config = Column(JsonType, nullable=False, default={})
    
    # 状态管理
    enabled = Column(Boolean, default=True)
    
    # 审计字段
    created_by = Column(String(191))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # 关系
    subscriptions = relationship('Subscription', back_populates='channel', cascade='all, delete-orphan')
    
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
    
    def enable(self):
        """启用渠道"""
        self.enabled = True
        self.updated_at = utcnow()
    
    def disable(self):
        """禁用渠道"""
        self.enabled = False
        self.updated_at = utcnow()
    
    def update_config(self, config: Dict[str, Any]):
        """
        更新渠道配置
        
        Args:
            config: 新的配置
        """
        self.config = config
        self.updated_at = utcnow()
    
    def is_feishu(self) -> bool:
        """是否为飞书渠道"""
        return self.channel_type == ChannelType.FEISHU.value
    
    def is_email(self) -> bool:
        """是否为邮件渠道"""
        return self.channel_type == ChannelType.EMAIL.value
    
    def is_webhook(self) -> bool:
        """是否为Webhook渠道"""
        return self.channel_type == ChannelType.WEBHOOK.value
    
    def is_oss(self) -> bool:
        """是否为OSS渠道"""
        return self.channel_type == ChannelType.OSS.value
    
    def get_feishu_chat_id(self) -> Optional[str]:
        """获取飞书群ID"""
        if self.is_feishu() and self.config:
            return self.config.get('chat_id')
        return None
    
    def get_feishu_webhook_url(self) -> Optional[str]:
        """获取飞书Webhook URL"""
        if self.is_feishu() and self.config:
            return self.config.get('webhook_url')
        return None
    
    def validate_config(self) -> List[str]:
        """
        验证配置
        
        Returns:
            错误列表，空列表表示验证通过
        """
        errors = []
        
        if self.channel_type == ChannelType.FEISHU.value:
            if not self.config.get('chat_id') and not self.config.get('webhook_url'):
                errors.append("飞书渠道需要配置 chat_id 或 webhook_url")
        
        elif self.channel_type == ChannelType.EMAIL.value:
            if not self.config.get('recipients'):
                errors.append("邮件渠道需要配置 recipients")
        
        elif self.channel_type == ChannelType.WEBHOOK.value:
            if not self.config.get('url'):
                errors.append("Webhook渠道需要配置 url")
        
        elif self.channel_type == ChannelType.OSS.value:
            if not self.config.get('bucket'):
                errors.append("OSS渠道需要配置 bucket")
        
        return errors
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_config: bool = True) -> Dict[str, Any]:
        """
        转换为字典
        
        Args:
            include_config: 是否包含配置详情
        
        Returns:
            字典表示
        """
        result = {
            'id': self.id,
            'name': self.name,
            'channel_type': self.channel_type,
            'description': self.description,
            'enabled': self.enabled,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_config:
            result['config'] = self.config
        
        return result
    
    def __repr__(self):
        return f'<Channel {self.name} ({self.channel_type})>'
