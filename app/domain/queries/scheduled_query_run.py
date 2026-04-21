# app/domain/queries/scheduled_query_run.py
"""ScheduledQueryRun 领域实体（B-back-8）"""
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.extensions import db

_PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class ScheduledQueryRun(db.Model):
    """定时查询执行记录，对应 scheduled_query_runs 表。"""

    __tablename__ = "scheduled_query_runs"
    __table_args__ = {"extend_existing": True}

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    query_id = Column(
        BigInteger,
        ForeignKey("scheduled_queries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(16), nullable=False)  # running | success | failed | timeout
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    rows_returned = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)

    query = relationship("ScheduledQuery", back_populates="runs")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "query_id": self.query_id,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "rows_returned": self.rows_returned,
            "error": self.error,
        }
