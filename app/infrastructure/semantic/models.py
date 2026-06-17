from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Index, Integer, String, Text, UniqueConstraint, text

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow

# 自增主键类型（PostgreSQL BigInteger，SQLite 回退 Integer），供运行记录类共用
_PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class SemanticAssetORM(db.Model):
    """生产语义资产主表。"""

    __tablename__ = "semantic_assets"
    __table_args__ = (
        UniqueConstraint(
            "namespace",
            "asset_type",
            "asset_key",
            name="uq_semantic_assets_namespace_type_key",
        ),
        Index("idx_semantic_assets_type_status", "asset_type", "status"),
        Index("idx_semantic_assets_namespace_status_updated", "namespace", "status", "updated_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    namespace = Column(String(64), nullable=False, default="default")
    asset_type = Column(String(32), nullable=False)
    asset_key = Column(String(255), nullable=False)
    title = Column(String(255), nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    current_revision_id = Column(String(128), nullable=True)
    current_release_id = Column(String(128), nullable=True)
    owner_principal_id = Column(String(191), nullable=True)
    source_kind = Column(String(32), nullable=False, default="human")
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class SemanticAssetRevisionORM(db.Model):
    """生产语义资产不可变版本表。"""

    __tablename__ = "semantic_asset_revisions"
    __table_args__ = (
        UniqueConstraint(
            "asset_id",
            "revision_no",
            name="uq_semantic_asset_revisions_asset_revision_no",
        ),
        Index("idx_semantic_asset_revisions_asset_checksum", "asset_id", "spec_checksum"),
        Index("idx_semantic_asset_revisions_status_created", "revision_status", "created_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    asset_id = Column(String(128), nullable=False)
    revision_no = Column(Integer, nullable=False)
    revision_status = Column(String(32), nullable=False, default="draft")
    spec_json = Column(JsonType, nullable=False, default=dict)
    spec_checksum = Column(String(64), nullable=False)
    change_summary = Column(String(512), nullable=True)
    proposal_id = Column(String(128), nullable=True)
    created_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class SemanticAssetDependencyORM(db.Model):
    """生产语义资产依赖表。"""

    __tablename__ = "semantic_asset_dependencies"
    __table_args__ = (
        Index(
            "idx_semantic_asset_dependencies_revision",
            "asset_revision_id",
        ),
        Index(
            "idx_semantic_asset_dependencies_depends_on",
            "depends_on_asset_id",
            "depends_on_revision_id",
        ),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    asset_revision_id = Column(String(128), nullable=False)
    depends_on_asset_id = Column(String(128), nullable=False)
    depends_on_revision_id = Column(String(128), nullable=True)
    dependency_type = Column(String(64), nullable=False)
    required = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class SemanticReleaseORM(db.Model):
    """语义资产 release record。"""

    __tablename__ = "semantic_releases"
    __table_args__ = (
        UniqueConstraint("namespace", "release_no", name="uq_semantic_releases_namespace_release_no"),
        UniqueConstraint(
            "namespace",
            "idempotency_key",
            name="uq_semantic_releases_namespace_idempotency_key",
        ),
        Index("idx_semantic_releases_namespace_status_created", "namespace", "status", "created_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    release_no = Column(Integer, nullable=False)
    namespace = Column(String(64), nullable=False, default="default")
    status = Column(String(32), nullable=False, default="created")
    scope_json = Column(JsonType, nullable=False, default=dict)
    gate_result_json = Column(JsonType, nullable=False, default=dict)
    previous_release_id = Column(String(128), nullable=True)
    rollback_of_release_id = Column(String(128), nullable=True)
    idempotency_key = Column(String(128), nullable=True)
    published_by = Column(String(191), nullable=True)
    published_at = Column(DateTime, nullable=True)
    status_reason = Column(String(512), nullable=True)
    status_changed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class SemanticReleaseAssetORM(db.Model):
    """release 发布的资产 revision 集合。"""

    __tablename__ = "semantic_release_assets"
    __table_args__ = (
        Index("idx_semantic_release_assets_asset", "asset_id"),
        Index("idx_semantic_release_assets_revision", "revision_id"),
        {"extend_existing": True},
    )

    release_id = Column(String(128), primary_key=True)
    asset_id = Column(String(128), primary_key=True)
    revision_id = Column(String(128), nullable=False)
    asset_type = Column(String(32), nullable=False)
    asset_key = Column(String(255), nullable=False)


class SemanticRuntimeSnapshotORM(db.Model):
    """Runtime 只读快照表。"""

    __tablename__ = "semantic_runtime_snapshots"
    __table_args__ = (
        Index("idx_semantic_runtime_snapshots_release", "release_id"),
        Index("idx_semantic_runtime_snapshots_namespace_status", "namespace", "status"),
        Index(
            "uq_semantic_runtime_snapshots_active_namespace",
            "namespace",
            unique=True,
            sqlite_where=text("status = 'active'"),
            postgresql_where=text("status = 'active'"),
        ),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    release_id = Column(String(128), nullable=False)
    namespace = Column(String(64), nullable=False, default="default")
    status = Column(String(32), nullable=False, default="active")
    asset_manifest_json = Column(JsonType, nullable=False, default=dict)
    binding_manifest_json = Column(JsonType, nullable=False, default=dict)
    policy_manifest_json = Column(JsonType, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    activated_at = Column(DateTime, nullable=True)
    superseded_at = Column(DateTime, nullable=True)


class SemanticModelingAgentSessionORM(db.Model):
    """语义建模 Copilot 会话的生产持久化模型。"""

    __tablename__ = "semantic_modeling_agent_sessions"
    __table_args__ = (
        Index("idx_semantic_modeling_sessions_principal_updated", "principal_id", "updated_at"),
        Index("idx_semantic_modeling_sessions_status_updated", "status", "updated_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    principal_id = Column(String(191), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    state = Column(String(32), nullable=False, default="created")
    state_version = Column(Integer, nullable=False, default=1)
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


class SemanticModelingBuildProjectORM(db.Model):
    """语义建设 Build Project 持久化模型。"""

    __tablename__ = "semantic_modeling_build_projects"
    __table_args__ = (
        Index("idx_semantic_build_projects_principal_updated", "created_by", "updated_at"),
        Index("idx_semantic_build_projects_status_updated", "status", "updated_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    created_by = Column(String(191), nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    payload_json = Column(JsonType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class SemanticModelingAssetPackageORM(db.Model):
    """语义建设候选 Asset Package 持久化模型。"""

    __tablename__ = "semantic_modeling_asset_packages"
    __table_args__ = (
        Index("idx_semantic_asset_packages_project_status", "project_id", "status"),
        Index("idx_semantic_asset_packages_risk", "risk"),
        {"extend_existing": True},
    )

    id = Column(String(160), primary_key=True)
    project_id = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="ready_for_review")
    risk = Column(String(32), nullable=False, default="medium")
    payload_json = Column(JsonType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class DataAssetTableORM(db.Model):
    """数据资产底座物理表事实。"""

    __tablename__ = "data_asset_tables"
    __table_args__ = (
        UniqueConstraint(
            "source_id",
            "database",
            "schema",
            "name",
            name="uq_data_asset_tables_source_database_schema_name",
        ),
        Index("idx_data_asset_tables_source_layer", "source_id", "layer"),
        Index("idx_data_asset_tables_sync_profile", "sync_status", "profile_status"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    source_id = Column(String(128), nullable=False)
    database = Column(String(191), nullable=False)
    schema = Column(String(191), nullable=True)
    name = Column(String(255), nullable=False)
    title = Column(String(255), nullable=True)
    description = Column(String(1024), nullable=True)
    layer = Column(String(64), nullable=True)
    owner = Column(String(128), nullable=True)
    table_type = Column(String(64), nullable=False, default="table")
    lifecycle_status = Column(String(32), nullable=False, default="active")
    row_count = Column(Integer, nullable=True)
    partition_count = Column(Integer, nullable=True)
    field_count = Column(Integer, nullable=False, default=0)
    profile_status = Column(String(32), nullable=False, default="unknown")
    sync_status = Column(String(32), nullable=False, default="unknown")
    last_synced_at = Column(DateTime, nullable=True)
    last_profiled_at = Column(DateTime, nullable=True)
    extra_json = Column(JsonType, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class DataAssetFieldORM(db.Model):
    """数据资产底座字段事实。"""

    __tablename__ = "data_asset_fields"
    __table_args__ = (
        UniqueConstraint("table_id", "name", name="uq_data_asset_fields_table_name"),
        Index("idx_data_asset_fields_table_ordinal", "table_id", "ordinal"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    table_id = Column(String(128), nullable=False)
    source_id = Column(String(128), nullable=False)
    database = Column(String(191), nullable=False)
    schema = Column(String(191), nullable=True)
    table_name = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    data_type = Column(Text, nullable=False)
    ordinal = Column(Integer, nullable=False, default=0)
    nullable = Column(Boolean, nullable=False, default=True)
    comment = Column(String(1024), nullable=True)
    profile_json = Column(JsonType, nullable=False, default=dict)
    sensitivity_level = Column(String(32), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class DataAssetSnapshotORM(db.Model):
    """资产快照，包括 schema/profile/partition/quality。"""

    __tablename__ = "data_asset_snapshots"
    __table_args__ = (
        Index("idx_data_asset_snapshots_table_type_created", "table_id", "snapshot_type", "created_at"),
        Index("idx_data_asset_snapshots_sync_run", "sync_run_id"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    table_id = Column(String(128), nullable=False)
    snapshot_type = Column(String(32), nullable=False)
    payload_json = Column(JsonType, nullable=False, default=dict)
    sync_run_id = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class DataAssetSyncRunORM(db.Model):
    """元数据同步批次。"""

    __tablename__ = "data_asset_sync_runs"
    __table_args__ = (
        Index("idx_data_asset_sync_runs_source_started", "source_id", "started_at"),
        Index("idx_data_asset_sync_runs_status", "status"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    source_id = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="running")
    started_at = Column(DateTime, nullable=False, default=utcnow)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(String(1024), nullable=True)
    stats_json = Column(JsonType, nullable=False, default=dict)


class DataAssetUsageORM(db.Model):
    """资产使用记录。"""

    __tablename__ = "data_asset_usage"
    __table_args__ = (
        Index("idx_data_asset_usage_table_source", "table_id", "source_type"),
        Index("idx_data_asset_usage_last_used", "last_used_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    table_id = Column(String(128), nullable=False)
    field_id = Column(String(128), nullable=True)
    source_type = Column(String(64), nullable=False)
    source_ref = Column(String(255), nullable=False)
    usage_count = Column(Integer, nullable=False, default=1)
    last_used_at = Column(DateTime, nullable=False, default=utcnow)
    metadata_json = Column(JsonType, nullable=False, default=dict)


class DataAssetLineageORM(db.Model):
    """轻量资产血缘边。"""

    __tablename__ = "data_asset_lineage"
    __table_args__ = (
        Index("idx_data_asset_lineage_source", "source_table_id", "relation_type"),
        Index("idx_data_asset_lineage_target", "target_type", "target_ref"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    source_table_id = Column(String(128), nullable=False)
    target_table_id = Column(String(128), nullable=True)
    target_type = Column(String(64), nullable=False)
    target_ref = Column(String(255), nullable=False)
    relation_type = Column(String(32), nullable=False, default="downstream")
    metadata_json = Column(JsonType, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class DiagnoseRun(db.Model):
    """语义诊断历史记录，对应 semantic_diagnose_runs 表（B-back-9）。"""

    __tablename__ = "semantic_diagnose_runs"
    __table_args__ = {"extend_existing": True}

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    input_kind = Column(String(32), nullable=False)  # nl | sql | yaml
    input_text = Column(Text, nullable=False)
    parse_ok = Column(Boolean, nullable=True)
    validate_ok = Column(Boolean, nullable=True)
    sql_text = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    # 诊断时刻语义定义集的版本标识，用于回放时检测定义是否已漂移
    definition_hash = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "input_kind": self.input_kind,
            "input_text": self.input_text,
            "parse_ok": self.parse_ok,
            "validate_ok": self.validate_ok,
            "sql_text": self.sql_text,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "definition_hash": self.definition_hash,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


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
