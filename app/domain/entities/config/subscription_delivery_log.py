"""
订阅分发日志实体

记录 DeliveryService 每次向渠道投递的结果，供 UI 展示订阅触发历史。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


class SubscriptionDeliveryLog(db.Model):
    """订阅分发日志

    DeliveryService 每次调用具体渠道发送完成后追加一条记录。
    """

    __tablename__ = 'subscription_delivery_logs'
    __table_args__ = (
        Index('idx_sub_delivery_logs_subscription_id', 'subscription_id'),
        Index('idx_sub_delivery_logs_trigger_at', 'trigger_at'),
        {'extend_existing': True},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    subscription_id = Column(
        BigInteger,
        ForeignKey('subscriptions.id', ondelete='CASCADE'),
        nullable=False,
    )
    channel_id = Column(BigInteger, nullable=True)

    event_type = Column(String(128), nullable=True)
    status = Column(String(16), nullable=False)  # success | failed | skipped
    message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    trigger_at = Column(DateTime, nullable=False, default=utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'subscription_id': self.subscription_id,
            'channel_id': self.channel_id,
            'event_type': self.event_type,
            'status': self.status,
            'message': self.message,
            'duration_ms': self.duration_ms,
            'trigger_at': self.trigger_at.isoformat() if self.trigger_at else None,
        }
