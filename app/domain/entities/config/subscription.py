"""
订阅实体

表示应用实例与渠道之间的订阅关系（独立实体）
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Dict, Any, List, Optional
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, ForeignKey
from app.shared.db_types import JsonType, ArrayOfString
from sqlalchemy.orm import relationship
from app.extensions import db


class Subscription(db.Model):
    """
    订阅实体
    
    职责：
    1. 管理应用实例与渠道之间的订阅关系
    2. 定义订阅的事件类型和过滤条件
    3. 独立于应用实例生命周期
    """
    __tablename__ = 'subscriptions'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # 关联关系
    app_instance_id = Column(BigInteger, ForeignKey('app_instances.id'), nullable=False)
    channel_id = Column(BigInteger, ForeignKey('channels.id'), nullable=False)
    
    # 订阅规则
    # 订阅的事件类型，如 ['app.execution.completed', 'app.execution.failed']
    event_types = Column(ArrayOfString, nullable=False, default=[])
    
    # 过滤条件（可选），如 { "output.status": "success" }
    filter_conditions = Column(JsonType, default={})
    
    # 分发配置
    # 可覆盖渠道默认的消息模板等
    delivery_config = Column(JsonType, default={})
    
    # 状态管理
    enabled = Column(Boolean, default=True)
    
    # 审计字段
    created_by = Column(String(191))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # 关系
    app_instance = relationship('AppInstance', backref='subscriptions')
    channel = relationship('Channel', back_populates='subscriptions')
    
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
        """启用订阅"""
        self.enabled = True
        self.updated_at = utcnow()
    
    def disable(self):
        """禁用订阅"""
        self.enabled = False
        self.updated_at = utcnow()
    
    def matches_event(self, event_type: str, event_data: Dict[str, Any] = None) -> bool:
        """
        判断是否匹配事件
        
        Args:
            event_type: 事件类型
            event_data: 事件数据
        
        Returns:
            是否匹配
        """
        # 检查事件类型
        if event_type not in self.event_types:
            return False
        
        # 检查过滤条件
        if self.filter_conditions and event_data:
            for key, expected_value in self.filter_conditions.items():
                # 支持嵌套路径，如 "output.status"
                actual_value = self._get_nested_value(event_data, key)
                if actual_value != expected_value:
                    return False
        
        return True
    
    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Any:
        """
        获取嵌套路径的值
        
        Args:
            data: 数据字典
            path: 路径，如 "output.status"
        
        Returns:
            对应的值，不存在返回 None
        """
        keys = path.split('.')
        current = data
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current
    
    def update_event_types(self, event_types: List[str]):
        """更新订阅的事件类型"""
        self.event_types = event_types
        self.updated_at = utcnow()
    
    def update_filter_conditions(self, conditions: Dict[str, Any]):
        """更新过滤条件"""
        self.filter_conditions = conditions
        self.updated_at = utcnow()
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_relations: bool = False) -> Dict[str, Any]:
        """
        转换为字典
        
        Args:
            include_relations: 是否包含关联实体信息
        
        Returns:
            字典表示
        """
        result = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'app_instance_id': self.app_instance_id,
            'channel_id': self.channel_id,
            'event_types': self.event_types,
            'filter_conditions': self.filter_conditions,
            'delivery_config': self.delivery_config,
            'enabled': self.enabled,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_relations:
            if self.app_instance:
                result['app_instance'] = {
                    'id': self.app_instance.id,
                    'name': self.app_instance.name,
                    'app_code': self.app_instance.app_code,
                    'app_name': self.app_instance.app_definition.name if self.app_instance.app_definition else None
                }
            if self.channel:
                result['channel'] = {
                    'id': self.channel.id,
                    'name': self.channel.name,
                    'channel_type': self.channel.channel_type
                }
        
        return result
    
    def __repr__(self):
        return f'<Subscription {self.name} (instance={self.app_instance_id}, channel={self.channel_id})>'
