from __future__ import annotations

from sqlalchemy import BigInteger, Column, DateTime, Index, String, Text

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


class AgentInferenceRuntimeRunORM(db.Model):
    """Agent 推理 Runtime 执行轨迹。"""

    __tablename__ = "agent_inference_runtime_runs"
    __table_args__ = (
        Index("idx_agent_runtime_runs_app_action_created", "app_id", "action", "created_at"),
        Index("idx_agent_runtime_runs_principal_created", "principal_id", "created_at"),
        Index("idx_agent_runtime_runs_context", "project_id", "session_id", "thread_id", "turn_id"),
        {"extend_existing": True},
    )

    run_id = Column(String(128), primary_key=True)
    app_id = Column(String(128), nullable=False)
    action = Column(String(255), nullable=False)
    runtime_name = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False)
    project_id = Column(String(128), nullable=False)
    session_id = Column(String(128), nullable=False)
    thread_id = Column(String(128), nullable=False)
    turn_id = Column(String(128), nullable=False)
    principal_id = Column(String(128), nullable=True)
    provider_ref_json = Column(JsonType, nullable=True)
    usage_json = Column(JsonType, nullable=False, default=dict)
    error_json = Column(JsonType, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AgentInferenceRuntimeArtifactORM(db.Model):
    """Agent 推理 Runtime 产物元数据。"""

    __tablename__ = "agent_inference_runtime_artifacts"
    __table_args__ = (
        Index("idx_agent_runtime_artifacts_run_created", "run_id", "created_at"),
        Index("idx_agent_runtime_artifacts_owner_run", "principal_id", "run_id"),
        Index("idx_agent_runtime_artifacts_context", "project_id", "session_id", "thread_id", "turn_id"),
        {"extend_existing": True},
    )

    artifact_id = Column(String(128), primary_key=True)
    run_id = Column(String(128), nullable=False)
    app_id = Column(String(128), nullable=False)
    principal_id = Column(String(128), nullable=True)
    project_id = Column(String(128), nullable=False)
    session_id = Column(String(128), nullable=False)
    thread_id = Column(String(128), nullable=False)
    turn_id = Column(String(128), nullable=False)
    artifact_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=False)
    mime_type = Column(String(128), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    sha256 = Column(String(128), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
