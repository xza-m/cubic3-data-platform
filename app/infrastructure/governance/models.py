"""治理审计 SQLAlchemy 模型。"""
from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text

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


class AccessExecutionProfileORM(db.Model):
    """数据访问执行画像。"""

    __tablename__ = "access_execution_profiles"
    __table_args__ = (
        Index("idx_access_execution_profiles_status", "status"),
        Index("idx_access_execution_profiles_level", "data_level"),
        {"extend_existing": True},
    )

    profile_code = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    credential_mode = Column(String(32), nullable=False)
    credential_ref = Column(String(255), nullable=True)
    data_level = Column(String(16), nullable=False, default="M1", server_default="M1")
    allowed_operations = Column(JsonType, nullable=False, default=list)
    max_rows = Column(Integer, nullable=True)
    timeout_seconds = Column(Integer, nullable=True)
    export_allowed = Column(Boolean, nullable=False, default=False, server_default="false")
    requires_strong_audit = Column(Boolean, nullable=False, default=False, server_default="false")
    status = Column(String(32), nullable=False, default="active", server_default="active")
    created_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AccessDataPolicyORM(db.Model):
    """数据访问准入规则。"""

    __tablename__ = "access_data_policies"
    __table_args__ = (
        Index("idx_access_data_policies_status", "status"),
        Index("idx_access_data_policies_priority", "priority"),
        Index("ix_access_data_policies_execution_profile_code", "execution_profile_code"),
        {"extend_existing": True},
    )

    policy_code = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    priority = Column(Integer, nullable=False, default=0, server_default="0")
    subject_roles = Column(JsonType, nullable=False, default=list)
    resource_scope = Column(JsonType, nullable=False, default=dict)
    actions = Column(JsonType, nullable=False, default=list)
    effect = Column(String(32), nullable=False, default="allow", server_default="allow")
    execution_profile_code = Column(String(64), nullable=True)
    reason = Column(Text, nullable=True)
    policy_version = Column(String(64), nullable=False, default="v1", server_default="v1")
    policy_epoch = Column(Integer, nullable=False, default=1, server_default="1")
    created_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AccessPolicyDecisionORM(db.Model):
    """一次策略判定记录。"""

    __tablename__ = "access_policy_decisions"
    __table_args__ = (
        Index("idx_access_policy_decisions_principal", "principal_id"),
        Index("idx_access_policy_decisions_decision", "decision"),
        Index("idx_access_policy_decisions_level", "data_level"),
        Index("idx_access_policy_decisions_created", "created_at"),
        {"extend_existing": True},
    )

    decision_id = Column(String(64), primary_key=True)
    principal_id = Column(String(191), nullable=False)
    actor_id = Column(String(191), nullable=True)
    decision = Column(String(32), nullable=False)
    reason_code = Column(String(64), nullable=False)
    reason = Column(Text, nullable=True)
    data_level = Column(String(16), nullable=False)
    resource_set = Column(JsonType, nullable=False, default=dict)
    sql_hashes = Column(JsonType, nullable=False, default=list)
    matched_policies = Column(JsonType, nullable=False, default=list)
    execution_profile_code = Column(String(64), nullable=True)
    policy_version = Column(String(64), nullable=True)
    policy_epoch = Column(Integer, nullable=False, default=1, server_default="1")
    decision_type = Column(String(32), nullable=False, default="inline", server_default="inline")
    governance_required = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, nullable=False, default=utcnow)
