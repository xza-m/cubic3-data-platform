# app/domain/queries/scheduled_query.py
"""ScheduledQuery 领域实体（B-back-8）"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.extensions import db

_PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class ScheduledQuery(db.Model):
    """定时查询实体，对应 scheduled_queries 表。"""

    __tablename__ = "scheduled_queries"
    __table_args__ = {"extend_existing": True}

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    sql = Column(Text, nullable=False)
    datasource_id = Column(BigInteger, nullable=False)
    cron = Column(String(64), nullable=False)
    timezone = Column(String(64), nullable=False, default="Asia/Shanghai")
    enabled = Column(Boolean, nullable=False, default=True)
    next_run_at = Column(DateTime, nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    last_status = Column(String(16), nullable=True)
    owner_id = Column(String(128), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    runs = relationship(
        "ScheduledQueryRun",
        back_populates="query",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "sql": self.sql,
            "datasource_id": self.datasource_id,
            "cron": self.cron,
            "timezone": self.timezone,
            "enabled": self.enabled,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_status": self.last_status,
            "owner_id": self.owner_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
