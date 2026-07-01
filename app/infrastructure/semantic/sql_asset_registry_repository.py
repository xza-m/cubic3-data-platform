"""SQL 驱动的语义资产 Registry 仓储。"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.domain.semantic.asset_registry import (
    RuntimeAsset,
    RuntimeSnapshot,
    SemanticRelease,
    SemanticReleaseAsset,
    SemanticAsset,
    SemanticAssetDependency,
    SemanticAssetRevision,
    canonical_spec_checksum,
)
from app.infrastructure.semantic.models import (
    SemanticAssetDependencyORM,
    SemanticAssetORM,
    SemanticAssetRevisionORM,
    SemanticReleaseAssetORM,
    SemanticReleaseORM,
    SemanticRuntimeSnapshotORM,
)


class SqlAssetRegistryRepository:
    """生产 SQL Registry 仓储；不依赖 YAML adapter。"""

    _DEFAULT_ASSET_UPDATE_FIELDS = {
        "title",
        "status",
        "current_revision_id",
        "current_release_id",
        "owner_principal_id",
        "source_kind",
    }

    def __init__(self, session: Session):
        self.session = session

    def get_asset(self, namespace: str, asset_type: str, asset_key: str) -> Optional[SemanticAsset]:
        row = (
            self.session.query(SemanticAssetORM)
            .filter(
                SemanticAssetORM.namespace == namespace,
                SemanticAssetORM.asset_type == asset_type,
                SemanticAssetORM.asset_key == asset_key,
            )
            .first()
        )
        return _asset_from_row(row) if row is not None else None

    def get_asset_by_id(self, asset_id: str) -> Optional[SemanticAsset]:
        row = self.session.get(SemanticAssetORM, asset_id)
        return _asset_from_row(row) if row is not None else None

    def create_or_update_asset(
        self,
        asset: SemanticAsset,
        *,
        allowed_update_fields: Optional[set[str]] = None,
    ) -> SemanticAsset:
        self._lock_asset_key(asset.namespace, asset.asset_type, asset.asset_key)
        allowed = allowed_update_fields or self._DEFAULT_ASSET_UPDATE_FIELDS
        row = self._find_asset_row(asset.namespace, asset.asset_type, asset.asset_key)
        if row is None:
            try:
                row = SemanticAssetORM(
                    id=asset.id,
                    namespace=asset.namespace,
                    asset_type=asset.asset_type,
                    asset_key=asset.asset_key,
                    created_at=_parse_utc(asset.created_at) or datetime.utcnow(),
                )
                self.session.add(row)
                for field in allowed:
                    if field in {"namespace", "asset_type", "asset_key", "id"}:
                        continue
                    if hasattr(row, field):
                        setattr(row, field, getattr(asset, field))
                row.updated_at = _parse_utc(asset.updated_at) or datetime.utcnow()
                self.session.commit()
                return _asset_from_row(row)
            except IntegrityError:
                # 并发窗口内另一个事务已抢先 insert 成功：回滚本次 insert，
                # 重新读取当前记录，按 update 分支合并允许更新的字段后返回，
                # 不向调用方裸抛未处理的 IntegrityError。
                self.session.rollback()
                row = self._find_asset_row(asset.namespace, asset.asset_type, asset.asset_key)
                if row is None:
                    raise

        for field in allowed:
            if field in {"namespace", "asset_type", "asset_key", "id"}:
                continue
            if hasattr(row, field):
                setattr(row, field, getattr(asset, field))
        row.updated_at = _parse_utc(asset.updated_at) or datetime.utcnow()
        self.session.commit()
        return _asset_from_row(row)

    def _find_asset_row(
        self,
        namespace: str,
        asset_type: str,
        asset_key: str,
    ) -> Optional[SemanticAssetORM]:
        return (
            self.session.query(SemanticAssetORM)
            .filter(
                SemanticAssetORM.namespace == namespace,
                SemanticAssetORM.asset_type == asset_type,
                SemanticAssetORM.asset_key == asset_key,
            )
            .first()
        )

    def _lock_asset_key(self, namespace: str, asset_type: str, asset_key: str) -> None:
        """asset upsert 的并发保护锁。

        lock_key 前缀（``semantic_asset:``）与 release 发布锁（``semantic_release:``）
        不同，避免与 `_lock_release_namespace` 共享同一把锁导致不必要的串行化或语义混淆。
        """
        bind = self.session.get_bind()
        if bind is None or bind.dialect.name != "postgresql":
            return
        self.session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_class, hashtext(:lock_key))"),
            {
                "lock_class": 314159,
                "lock_key": f"semantic_asset:{namespace}:{asset_type}:{asset_key}",
            },
        )

    def append_revision(
        self,
        asset_id: str,
        spec: Dict[str, Any],
        *,
        proposal_id: Optional[str] = None,
        actor: Optional[str] = None,
        force_new_revision: bool = False,
    ) -> SemanticAssetRevision:
        asset_row = self.session.get(SemanticAssetORM, asset_id)
        if asset_row is None:
            raise ValueError(f"semantic asset not found: {asset_id}")

        checksum = canonical_spec_checksum(spec)
        if not force_new_revision:
            existing = (
                self.session.query(SemanticAssetRevisionORM)
                .filter(
                    SemanticAssetRevisionORM.asset_id == asset_id,
                    SemanticAssetRevisionORM.spec_checksum == checksum,
                    SemanticAssetRevisionORM.revision_status != "archived",
                )
                .order_by(SemanticAssetRevisionORM.revision_no.desc())
                .first()
            )
            if existing is not None:
                asset_row.current_revision_id = existing.id
                asset_row.updated_at = datetime.utcnow()
                self.session.commit()
                return _revision_from_row(existing)

        max_revision_no = (
            self.session.query(func.max(SemanticAssetRevisionORM.revision_no))
            .filter(SemanticAssetRevisionORM.asset_id == asset_id)
            .scalar()
            or 0
        )
        row = SemanticAssetRevisionORM(
            id=f"rev_{uuid.uuid4().hex}",
            asset_id=asset_id,
            revision_no=int(max_revision_no) + 1,
            revision_status="draft",
            spec_json=spec,
            spec_checksum=checksum,
            proposal_id=proposal_id,
            created_by=actor,
            created_at=datetime.utcnow(),
        )
        self.session.add(row)
        asset_row.current_revision_id = row.id
        asset_row.updated_at = datetime.utcnow()
        self.session.commit()
        return _revision_from_row(row)

    def get_revision(self, revision_id: str) -> Optional[SemanticAssetRevision]:
        row = self.session.get(SemanticAssetRevisionORM, revision_id)
        return _revision_from_row(row) if row is not None else None

    def list_revisions(self, asset_id: str) -> list[SemanticAssetRevision]:
        rows = (
            self.session.query(SemanticAssetRevisionORM)
            .filter(SemanticAssetRevisionORM.asset_id == asset_id)
            .order_by(SemanticAssetRevisionORM.revision_no.asc())
            .all()
        )
        return [_revision_from_row(row) for row in rows]

    def replace_dependencies(
        self,
        revision_id: str,
        dependencies: list[SemanticAssetDependency],
    ) -> None:
        (
            self.session.query(SemanticAssetDependencyORM)
            .filter(SemanticAssetDependencyORM.asset_revision_id == revision_id)
            .delete(synchronize_session=False)
        )
        for dependency in dependencies:
            self.session.add(_dependency_to_row(dependency))
        self.session.commit()

    def list_dependencies(self, revision_id: str) -> list[SemanticAssetDependency]:
        rows = (
            self.session.query(SemanticAssetDependencyORM)
            .filter(SemanticAssetDependencyORM.asset_revision_id == revision_id)
            .order_by(SemanticAssetDependencyORM.created_at.asc())
            .all()
        )
        return [_dependency_from_row(row) for row in rows]

    def save_runtime_snapshot(self, snapshot: RuntimeSnapshot) -> RuntimeSnapshot:
        row = SemanticRuntimeSnapshotORM(
            id=snapshot.id,
            release_id=snapshot.release_id,
            namespace=snapshot.namespace,
            status=snapshot.status,
            asset_manifest_json=snapshot.asset_manifest_json,
            binding_manifest_json=snapshot.binding_manifest_json,
            policy_manifest_json=snapshot.policy_manifest_json,
            created_at=_parse_utc(snapshot.created_at) or datetime.utcnow(),
            activated_at=_parse_utc(snapshot.activated_at) if snapshot.activated_at else datetime.utcnow(),
            superseded_at=_parse_utc(snapshot.superseded_at),
        )
        self.session.add(row)
        self.session.commit()
        return _snapshot_from_row(row)

    def next_release_no(self, namespace: str) -> int:
        """读取 namespace 的下一个 release_no。

        该方法仅用于只读预览或兼容旧调用；正式发布必须在 `publish_with_snapshot`
        的事务锁内生成 release_no，避免并发发布拿到重复版本号。
        """

        value = (
            self.session.query(func.max(SemanticReleaseORM.release_no))
            .filter(SemanticReleaseORM.namespace == namespace)
            .scalar()
            or 0
        )
        return int(value) + 1

    def get_active_release_id(self, namespace: str) -> Optional[str]:
        row = (
            self.session.query(SemanticReleaseORM)
            .filter(
                SemanticReleaseORM.namespace == namespace,
                SemanticReleaseORM.status == "published",
            )
            .order_by(SemanticReleaseORM.release_no.desc())
            .first()
        )
        return row.id if row is not None else None

    def get_release(self, release_id: str) -> Optional[SemanticRelease]:
        row = self.session.get(SemanticReleaseORM, release_id)
        return _release_from_row(row) if row is not None else None

    def list_releases(
        self,
        namespace: str = "default",
        *,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SemanticRelease], int]:
        query = self.session.query(SemanticReleaseORM).filter(SemanticReleaseORM.namespace == namespace)
        if status:
            query = query.filter(SemanticReleaseORM.status == status)
        total = int(query.count())
        rows = (
            query.order_by(SemanticReleaseORM.release_no.desc(), SemanticReleaseORM.created_at.desc())
            .offset(max(offset, 0))
            .limit(max(1, min(limit, 200)))
            .all()
        )
        return [_release_from_row(row) for row in rows], total

    def update_release_status(
        self,
        release_id: str,
        *,
        status: str,
        reason: Optional[str] = None,
    ) -> Optional[SemanticRelease]:
        row = self.session.get(SemanticReleaseORM, release_id)
        if row is None:
            return None
        row.status = status
        row.status_reason = reason
        row.status_changed_at = datetime.utcnow()
        self.session.commit()
        return _release_from_row(row)

    def get_snapshot_by_release_id(self, release_id: str) -> Optional[RuntimeSnapshot]:
        row = (
            self.session.query(SemanticRuntimeSnapshotORM)
            .filter(SemanticRuntimeSnapshotORM.release_id == release_id)
            .order_by(SemanticRuntimeSnapshotORM.created_at.desc())
            .first()
        )
        return _snapshot_from_row(row) if row is not None else None

    def list_release_assets(self, release_id: str) -> list[SemanticReleaseAsset]:
        rows = (
            self.session.query(SemanticReleaseAssetORM)
            .filter(SemanticReleaseAssetORM.release_id == release_id)
            .order_by(SemanticReleaseAssetORM.asset_type.asc(), SemanticReleaseAssetORM.asset_key.asc())
            .all()
        )
        return [_release_asset_from_row(row) for row in rows]

    def publish_with_snapshot(
        self,
        release: SemanticRelease,
        release_assets: list[SemanticReleaseAsset],
        snapshot: RuntimeSnapshot,
        *,
        audit_writer=None,
    ) -> SemanticRelease:
        try:
            self._lock_release_namespace(release.namespace)
            existing = self._get_release_by_idempotency_key(
                release.namespace,
                release.idempotency_key,
            )
            if existing is not None:
                if existing.status == "published":
                    return _release_from_row(existing)
                if existing.status == "failed":
                    raise ValueError("failed_retry_with_new_idempotency_key")
                raise ValueError("semantic_release_idempotency_key_in_progress")

            release.previous_release_id = self.get_active_release_id(release.namespace)
            release.release_no = self._next_release_no_locked(release.namespace)
            now = datetime.utcnow()
            # §6.1 release 状态机：被替代的 release 显式落为 superseded（已 pin 消费方仍可读取）
            old_releases = (
                self.session.query(SemanticReleaseORM)
                .filter(
                    SemanticReleaseORM.namespace == release.namespace,
                    SemanticReleaseORM.status == "published",
                )
                .all()
            )
            for old_release in old_releases:
                old_release.status = "superseded"
                old_release.status_changed_at = now
            old_snapshots = (
                self.session.query(SemanticRuntimeSnapshotORM)
                .filter(
                    SemanticRuntimeSnapshotORM.namespace == release.namespace,
                    SemanticRuntimeSnapshotORM.status == "active",
                )
                .all()
            )
            for old_snapshot in old_snapshots:
                old_snapshot.status = "superseded"
                old_snapshot.superseded_at = now

            release_row = _release_to_row(release)
            release_row.status = "published"
            release_row.published_at = now
            self.session.add(release_row)
            for release_asset in release_assets:
                self.session.add(_release_asset_to_row(release_asset))
                asset_row = self.session.get(SemanticAssetORM, release_asset.asset_id)
                revision_row = self.session.get(SemanticAssetRevisionORM, release_asset.revision_id)
                if asset_row is not None:
                    asset_row.current_release_id = release.id
                    asset_row.status = "active"
                    asset_row.updated_at = now
                if revision_row is not None:
                    revision_row.revision_status = "published"
            snapshot_row = _snapshot_to_row(snapshot)
            snapshot_row.status = "active"
            snapshot_row.activated_at = now
            self.session.add(snapshot_row)
            if audit_writer is not None:
                audit_writer(
                    {
                        "release_id": release.id,
                        "snapshot_id": snapshot.id,
                        "namespace": release.namespace,
                        "asset_count": len(release_assets),
                    }
                )
            self.session.commit()
            return _release_from_row(release_row)
        except IntegrityError as exc:
            self.session.rollback()
            self._record_failed_release_attempt(
                release,
                failure_reason="concurrent_publish_conflict",
            )
            raise ValueError("concurrent_publish_conflict") from exc
        except Exception as exc:
            failure_reason = str(exc) or exc.__class__.__name__
            self.session.rollback()
            self._record_failed_release_attempt(release, failure_reason=failure_reason)
            raise

    def _get_release_by_idempotency_key(
        self,
        namespace: str,
        idempotency_key: Optional[str],
    ) -> Optional[SemanticReleaseORM]:
        if not idempotency_key:
            return None
        return (
            self.session.query(SemanticReleaseORM)
            .filter(
                SemanticReleaseORM.namespace == namespace,
                SemanticReleaseORM.idempotency_key == idempotency_key,
            )
            .first()
        )

    def _lock_release_namespace(self, namespace: str) -> None:
        bind = self.session.get_bind()
        if bind is None or bind.dialect.name != "postgresql":
            return
        self.session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_class, hashtext(:lock_key))"),
            {
                "lock_class": 314159,
                "lock_key": f"semantic_release:{namespace}",
            },
        )

    def _next_release_no_locked(self, namespace: str) -> int:
        value = (
            self.session.query(func.max(SemanticReleaseORM.release_no))
            .filter(SemanticReleaseORM.namespace == namespace)
            .scalar()
            or 0
        )
        return int(value) + 1

    def _record_failed_release_attempt(
        self,
        release: SemanticRelease,
        *,
        failure_reason: str,
    ) -> None:
        if not release.idempotency_key:
            return
        try:
            self._lock_release_namespace(release.namespace)
            if self._get_release_by_idempotency_key(release.namespace, release.idempotency_key) is not None:
                self.session.rollback()
                return
            failed_row = _release_to_row(release)
            failed_row.release_no = self._next_release_no_locked(release.namespace)
            failed_row.status = "failed"
            failed_row.published_at = None
            failed_row.gate_result_json = {
                **(release.gate_result_json or {}),
                "decision": "failed",
                "failure_reason": failure_reason,
            }
            self.session.add(failed_row)
            self.session.commit()
        except (IntegrityError, SQLAlchemyError):
            self.session.rollback()

    def get_active_snapshot(self, namespace: str = "default") -> Optional[RuntimeSnapshot]:
        row = (
            self.session.query(SemanticRuntimeSnapshotORM)
            .filter(
                SemanticRuntimeSnapshotORM.namespace == namespace,
                SemanticRuntimeSnapshotORM.status == "active",
            )
            .first()
        )
        return _snapshot_from_row(row) if row is not None else None

    def resolve_asset(
        self,
        snapshot_id: str,
        asset_type: str,
        asset_key: str,
    ) -> Optional[RuntimeAsset]:
        for asset in self.list_assets(snapshot_id, asset_type=asset_type):
            if asset.asset_key == asset_key:
                return asset
        return None

    def list_assets(
        self,
        snapshot_id: str,
        asset_type: Optional[str] = None,
    ) -> list[RuntimeAsset]:
        row = self.session.get(SemanticRuntimeSnapshotORM, snapshot_id)
        if row is None:
            return []
        snapshot = _snapshot_from_row(row)
        assets = snapshot.assets()
        if asset_type is not None:
            assets = [asset for asset in assets if asset.asset_type == asset_type]
        return assets


def _asset_from_row(row: SemanticAssetORM) -> SemanticAsset:
    return SemanticAsset(
        id=row.id,
        namespace=row.namespace,
        asset_type=row.asset_type,
        asset_key=row.asset_key,
        title=row.title,
        status=row.status,
        current_revision_id=row.current_revision_id,
        current_release_id=row.current_release_id,
        owner_principal_id=row.owner_principal_id,
        source_kind=row.source_kind,
        created_at=_format_utc(row.created_at),
        updated_at=_format_utc(row.updated_at),
    )


def _revision_from_row(row: SemanticAssetRevisionORM) -> SemanticAssetRevision:
    return SemanticAssetRevision(
        id=row.id,
        asset_id=row.asset_id,
        revision_no=row.revision_no,
        revision_status=row.revision_status,
        spec_json=row.spec_json or {},
        spec_checksum=row.spec_checksum,
        change_summary=row.change_summary,
        proposal_id=row.proposal_id,
        created_by=row.created_by,
        created_at=_format_utc(row.created_at),
    )


def _release_to_row(release: SemanticRelease) -> SemanticReleaseORM:
    return SemanticReleaseORM(
        id=release.id,
        release_no=release.release_no,
        namespace=release.namespace,
        status=release.status,
        scope_json=release.scope_json,
        gate_result_json=release.gate_result_json,
        previous_release_id=release.previous_release_id,
        rollback_of_release_id=release.rollback_of_release_id,
        idempotency_key=release.idempotency_key,
        published_by=release.published_by,
        published_at=_parse_utc(release.published_at),
        status_reason=release.status_reason,
        status_changed_at=_parse_utc(release.status_changed_at),
        created_at=_parse_utc(release.created_at) or datetime.utcnow(),
    )


def _release_from_row(row: SemanticReleaseORM) -> SemanticRelease:
    return SemanticRelease(
        id=row.id,
        release_no=row.release_no,
        namespace=row.namespace,
        status=row.status,
        scope_json=row.scope_json or {},
        gate_result_json=row.gate_result_json or {},
        previous_release_id=row.previous_release_id,
        rollback_of_release_id=row.rollback_of_release_id,
        idempotency_key=row.idempotency_key,
        published_by=row.published_by,
        published_at=_format_utc(row.published_at) if row.published_at else None,
        status_reason=row.status_reason,
        status_changed_at=_format_utc(row.status_changed_at) if row.status_changed_at else None,
        created_at=_format_utc(row.created_at),
    )


def _release_asset_to_row(release_asset: SemanticReleaseAsset) -> SemanticReleaseAssetORM:
    return SemanticReleaseAssetORM(
        release_id=release_asset.release_id,
        asset_id=release_asset.asset_id,
        revision_id=release_asset.revision_id,
        asset_type=release_asset.asset_type,
        asset_key=release_asset.asset_key,
    )


def _release_asset_from_row(row: SemanticReleaseAssetORM) -> SemanticReleaseAsset:
    return SemanticReleaseAsset(
        release_id=row.release_id,
        asset_id=row.asset_id,
        revision_id=row.revision_id,
        asset_type=row.asset_type,
        asset_key=row.asset_key,
    )


def _snapshot_to_row(snapshot: RuntimeSnapshot) -> SemanticRuntimeSnapshotORM:
    return SemanticRuntimeSnapshotORM(
        id=snapshot.id,
        release_id=snapshot.release_id,
        namespace=snapshot.namespace,
        status=snapshot.status,
        asset_manifest_json=snapshot.asset_manifest_json,
        binding_manifest_json=snapshot.binding_manifest_json,
        policy_manifest_json=snapshot.policy_manifest_json,
        created_at=_parse_utc(snapshot.created_at) or datetime.utcnow(),
        activated_at=_parse_utc(snapshot.activated_at),
        superseded_at=_parse_utc(snapshot.superseded_at),
    )


def _dependency_to_row(dependency: SemanticAssetDependency) -> SemanticAssetDependencyORM:
    return SemanticAssetDependencyORM(
        id=dependency.id,
        asset_revision_id=dependency.asset_revision_id,
        depends_on_asset_id=dependency.depends_on_asset_id,
        depends_on_revision_id=dependency.depends_on_revision_id,
        dependency_type=dependency.dependency_type,
        required=dependency.required,
        created_at=_parse_utc(dependency.created_at) or datetime.utcnow(),
    )


def _dependency_from_row(row: SemanticAssetDependencyORM) -> SemanticAssetDependency:
    return SemanticAssetDependency(
        id=row.id,
        asset_revision_id=row.asset_revision_id,
        depends_on_asset_id=row.depends_on_asset_id,
        depends_on_revision_id=row.depends_on_revision_id,
        dependency_type=row.dependency_type,
        required=row.required,
        created_at=_format_utc(row.created_at),
    )


def _snapshot_from_row(row: SemanticRuntimeSnapshotORM) -> RuntimeSnapshot:
    return RuntimeSnapshot(
        id=row.id,
        release_id=row.release_id,
        namespace=row.namespace,
        status=row.status,
        asset_manifest_json=row.asset_manifest_json or {},
        binding_manifest_json=row.binding_manifest_json or {},
        policy_manifest_json=row.policy_manifest_json or {},
        created_at=_format_utc(row.created_at),
        activated_at=_format_utc(row.activated_at) if row.activated_at else None,
        superseded_at=_format_utc(row.superseded_at) if row.superseded_at else None,
    )


def _parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        return parsed.replace(tzinfo=None)
    except ValueError:
        return None


def _format_utc(value: datetime | None) -> str:
    if value is None:
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"
    return value.replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
