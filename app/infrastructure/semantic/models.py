from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, UniqueConstraint, text

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


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
    owner_principal_id = Column(String(128), nullable=True)
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
    created_by = Column(String(128), nullable=True)
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
    published_by = Column(String(128), nullable=True)
    published_at = Column(DateTime, nullable=True)
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
    principal_id = Column(String(128), nullable=True)
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
