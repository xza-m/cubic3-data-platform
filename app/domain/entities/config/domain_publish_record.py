"""
语义域发布记录实体（B-6）
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import BigInteger, Column, DateTime, Index, String, Text

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


class DomainPublishRecord(db.Model):
    """领域发布记录（每次 publish_domain 追加一条）"""

    __tablename__ = 'domain_publish_records'
    __table_args__ = (
        Index('idx_domain_pub_records_domain_id', 'domain_id'),
        Index('idx_domain_pub_records_published_at', 'published_at'),
        {'extend_existing': True},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    domain_id = Column(String(128), nullable=False)
    domain_code = Column(String(128), nullable=True)
    version = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, default='success')
    published_by = Column(String(128), nullable=True)
    diff_summary = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    snapshot = Column(JsonType, nullable=True)
    published_at = Column(DateTime, nullable=False, default=utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'version': self.version,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'published_by': self.published_by or '',
            'status': self.status,
            'diff_summary': self.diff_summary,
            'note': self.note,
        }
