from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


_PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class QueryExecutionJobORM(db.Model):
    """查询执行任务持久化模型。"""

    __tablename__ = "query_execution_jobs"
    __table_args__ = (
        UniqueConstraint(
            "principal_id",
            "idempotency_key",
            name="uq_query_execution_jobs_principal_idempotency",
        ),
        Index("idx_query_execution_jobs_status_lease_created", "status", "lease_expires_at", "created_at"),
        Index("idx_query_execution_jobs_principal_created", "principal_id", "created_at"),
        Index("idx_query_execution_jobs_sql_hash", "sql_hash"),
        {"extend_existing": True},
    )

    id = Column(String(64), primary_key=True)
    trace_id = Column(String(64), nullable=False, index=True)
    principal_id = Column(String(128), nullable=False)
    route_type = Column(String(64), nullable=False)
    semantic_plan_id = Column(String(128), nullable=True, index=True)
    source_id = Column(BigInteger, nullable=False)
    project_name = Column(String(255), nullable=True)
    logical_sql = Column(Text, nullable=False)
    validated_sql = Column(Text, nullable=False)
    sql_hash = Column(String(128), nullable=False)
    resource_set_json = Column(JsonType, nullable=False, default=list)
    data_level = Column(String(32), nullable=False, default="M1")
    ticket_snapshot_json = Column(JsonType, nullable=False, default=dict)
    governance_snapshot_json = Column(JsonType, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="QUEUED", index=True)
    idempotency_key = Column(String(128), nullable=True)
    engine_query_id = Column(String(128), nullable=True, index=True)
    lease_owner = Column(String(128), nullable=True)
    lease_expires_at = Column(DateTime, nullable=True, index=True)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    retry_count = Column(Integer, nullable=False, default=0)
    error_code = Column(String(64), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    submitted_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


class QueryExecutionEventORM(db.Model):
    """查询执行事件模型。"""

    __tablename__ = "query_execution_events"
    __table_args__ = (
        Index("idx_query_execution_events_query_created", "query_id", "created_at"),
        {"extend_existing": True},
    )

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    query_id = Column(
        String(64),
        ForeignKey("query_execution_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type = Column(String(64), nullable=False)
    from_status = Column(String(32), nullable=True)
    to_status = Column(String(32), nullable=True)
    payload_json = Column(JsonType, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class QueryResultObjectORM(db.Model):
    """查询结果对象模型。"""

    __tablename__ = "query_result_objects"
    __table_args__ = (
        UniqueConstraint("query_id", name="uq_query_result_objects_query_id"),
        Index("idx_query_result_objects_status_expires", "status", "expires_at"),
        {"extend_existing": True},
    )

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    query_id = Column(
        String(64),
        ForeignKey("query_execution_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(String(32), nullable=False, default="DRAFT")
    storage_type = Column(String(32), nullable=False, default="local")
    content_type = Column(String(128), nullable=False, default="text/csv")
    file_path = Column(Text, nullable=True)
    row_count = Column(Integer, nullable=False, default=0)
    byte_size = Column(BigInteger, nullable=False, default=0)
    sha256 = Column(String(128), nullable=True)
    preview_json = Column(JsonType, nullable=False, default=dict)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    ready_at = Column(DateTime, nullable=True)
