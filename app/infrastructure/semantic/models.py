from __future__ import annotations

from sqlalchemy import Column, DateTime, Index, Integer, String

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


class SemanticModelingAgentSessionORM(db.Model):
    """语义建模 Copilot 会话的生产持久化模型。"""

    __tablename__ = "semantic_modeling_agent_sessions"
    __table_args__ = (
        Index("idx_semantic_modeling_sessions_principal_updated", "principal_id", "updated_at"),
        Index("idx_semantic_modeling_sessions_status_updated", "status", "updated_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    principal_id = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    title = Column(String(255), nullable=True)
    payload_json = Column(JsonType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class SemanticModelingProposalORM(db.Model):
    """语义建模 Proposal 的生产持久化模型。"""

    __tablename__ = "semantic_modeling_proposals"
    __table_args__ = (
        Index("idx_semantic_modeling_proposals_status_updated", "status", "updated_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    status = Column(String(32), nullable=False, default="created")
    payload_json = Column(JsonType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
