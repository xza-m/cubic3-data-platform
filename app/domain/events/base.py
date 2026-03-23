"""
领域事件基础类
"""
from dataclasses import dataclass, field, asdict
from datetime import datetime
from uuid import uuid4
from app.shared.utils.time import utcnow
from typing import Optional


@dataclass
class DomainEvent:
    """
    领域事件基类
    
    所有领域事件都应继承此类
    """
    event_id: str = field(default_factory=lambda: str(uuid4()))
    occurred_at: datetime = field(default_factory=utcnow)
    aggregate_id: Optional[int] = None
    user_id: Optional[str] = None
    
    # 通用事件结构支持
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    data: dict = field(default_factory=dict)
    
    # 内部使用的自定义事件类型
    _event_type: Optional[str] = field(default=None, repr=False)
    
    @property
    def event_type(self) -> str:
        """获取事件类型，优先使用自定义类型，否则使用类名"""
        return self._event_type or self.__class__.__name__
    
    def to_dict(self) -> dict:
        """转换为字典"""
        data = asdict(self)
        
        # 处理可能的私有字段
        if '_event_type' in data:
            del data['_event_type']
            
        data['event_type'] = self.event_type
        data['occurred_at'] = self.occurred_at.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: dict):
        """从字典创建事件"""
        # 移除辅助字段
        init_data = {k: v for k, v in data.items() if k not in ['event_type', '_event_type']}
        
        # 转换时间
        if 'occurred_at' in init_data and isinstance(init_data['occurred_at'], str):
            init_data['occurred_at'] = datetime.fromisoformat(init_data['occurred_at'])
            
        return cls(**init_data)
