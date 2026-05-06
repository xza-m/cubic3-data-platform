"""治理审计 SQLAlchemy 模型。"""
from __future__ import annotations

from sqlalchemy import Column, DateTime, String, Text

from app.extensions import db
from app.shared.db_types import ArrayOfString, JsonType
from app.shared.utils.time import utcnow


class GovernanceAuditTraceORM(db.Model):
    """语义与执行治理审计记录。"""

    __tablename__ = "governance_audit_traces"
    __table_args__ = {"extend_existing": True}

    id = Column(String(64), primary_key=True)
    target_type = Column(String(64), nullable=False, index=True)
    target_name = Column(String(255), nullable=False, index=True)
    principal_id = Column(String(128), nullable=True, index=True)
    semantic_plan_id = Column(String(128), nullable=True, index=True)
    sql_hash = Column(String(128), nullable=True, index=True)
    gateway_query_id = Column(String(128), nullable=True, index=True)
    maxcompute_task_id = Column(String(128), nullable=True, index=True)
    viewer_roles = Column(ArrayOfString, nullable=False, default=list)
    route_type = Column(String(64), nullable=False, default="direct", index=True)
    execution_target = Column(String(64), nullable=False)
    decision = Column(String(64), nullable=False, index=True)
    policy = Column(JsonType, nullable=True)
    policy_decision = Column(JsonType, nullable=False, default=dict)
    traceability = Column(JsonType, nullable=False, default=dict)
    reason = Column(Text, nullable=True)
    timestamp = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
