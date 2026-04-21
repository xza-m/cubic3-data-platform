# app/domain/semantic/views_materialize.py
"""
语义 View 物化运行记录 — 领域实体 & SQLAlchemy ORM 映射。

对应 migration: migrations/versions/20260420_02_add_view_materialize.py
"""
from __future__ import annotations

from sqlalchemy import BigInteger, Column, DateTime, Integer, String, Text

from app.extensions import db

_PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class SemanticViewMaterializeRun(db.Model):
    """semantic_view_materialize_runs 的 ORM 模型。

    状态机（语义层面）：semantic_views.materialize_status
        idle → running → idle (success) / failed

    本表每行代表一次具体的物化执行记录。
    """

    __tablename__ = "semantic_view_materialize_runs"
    __table_args__ = {"extend_existing": True}

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    view_id = Column(BigInteger, nullable=False, index=True)
    status = Column(String(16), nullable=False)
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "view_id": self.view_id,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error": self.error,
        }
