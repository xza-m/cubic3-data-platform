"""语义专项测试资产生命周期管理。"""
from __future__ import annotations

import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.infrastructure.semantic.models import (
    SemanticAssetDependencyORM,
    SemanticAssetORM,
    SemanticAssetRevisionORM,
    SemanticModelingAgentSessionORM,
    SemanticModelingProposalORM,
    SemanticReleaseAssetORM,
    SemanticReleaseORM,
    SemanticRuntimeSnapshotORM,
)


class SemanticTestFixtureManager:
    """统一创建、追踪和清理语义测试 namespace。"""

    def __init__(self, session, *, yaml_fixture_root: str | Path | None = None):
        self._session = session
        self._yaml_fixture_root = Path(yaml_fixture_root) if yaml_fixture_root else None
        self._assets: dict[str, list[tuple[str, str]]] = {}

    def namespace(self, prefix: str) -> str:
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        return f"{prefix}_{timestamp}_{uuid.uuid4().hex[:8]}"

    def register_asset(self, namespace: str, asset_id: str, asset_type: str) -> None:
        self._assets.setdefault(namespace, []).append((asset_id, asset_type))

    def assert_no_manual_asset_pollution(self, namespace: str) -> None:
        if self._session is None:
            return
        polluted = (
            self._session.query(SemanticAssetORM)
            .filter(
                SemanticAssetORM.namespace == namespace,
                SemanticAssetORM.source_kind != "test_fixture",
            )
            .count()
        )
        if polluted:
            raise AssertionError(f"manual semantic assets found in test namespace: {namespace}")

    def cleanup_namespace(self, namespace: str) -> dict[str, Any]:
        if self._session is None:
            return {"ok": True, "deleted": {}, "namespace": namespace}
        deleted: dict[str, int] = {}
        try:
            release_ids = [
                row.id
                for row in self._session.query(SemanticReleaseORM.id)
                .filter(SemanticReleaseORM.namespace == namespace)
                .all()
            ]
            asset_ids = [
                row.id
                for row in self._session.query(SemanticAssetORM.id)
                .filter(SemanticAssetORM.namespace == namespace)
                .all()
            ]
            revision_ids = [
                row.id
                for row in self._session.query(SemanticAssetRevisionORM.id)
                .filter(SemanticAssetRevisionORM.asset_id.in_(asset_ids or ["__none__"]))
                .all()
            ]

            deleted["runtime_snapshots"] = self._delete(
                self._session.query(SemanticRuntimeSnapshotORM).filter(
                    SemanticRuntimeSnapshotORM.namespace == namespace
                )
            )
            deleted["release_assets"] = self._delete(
                self._session.query(SemanticReleaseAssetORM).filter(
                    SemanticReleaseAssetORM.release_id.in_(release_ids or ["__none__"])
                )
            )
            deleted["releases"] = self._delete(
                self._session.query(SemanticReleaseORM).filter(SemanticReleaseORM.namespace == namespace)
            )
            deleted["dependencies"] = self._delete(
                self._session.query(SemanticAssetDependencyORM).filter(
                    SemanticAssetDependencyORM.asset_revision_id.in_(revision_ids or ["__none__"])
                )
            )
            deleted["revisions"] = self._delete(
                self._session.query(SemanticAssetRevisionORM).filter(
                    SemanticAssetRevisionORM.asset_id.in_(asset_ids or ["__none__"])
                )
            )
            deleted["assets"] = self._delete(
                self._session.query(SemanticAssetORM).filter(SemanticAssetORM.namespace == namespace)
            )
            deleted["proposals"] = self._delete_payload_namespace(SemanticModelingProposalORM, namespace)
            deleted["sessions"] = self._delete_payload_namespace(SemanticModelingAgentSessionORM, namespace)
            deleted["yaml_fixture_outputs"] = self._cleanup_yaml_namespace(namespace)
            self._session.commit()
            return {"ok": True, "namespace": namespace, "deleted": deleted}
        except Exception as exc:
            self._session.rollback()
            return {
                "ok": False,
                "namespace": namespace,
                "deleted": deleted,
                "error": str(exc),
            }

    def _delete(self, query) -> int:
        count = query.count()
        query.delete(synchronize_session=False)
        return int(count)

    def _delete_payload_namespace(self, model, namespace: str) -> int:
        rows = self._session.query(model).all()
        count = 0
        for row in rows:
            payload = row.payload_json or {}
            if payload.get("test_namespace") == namespace or payload.get("namespace") == namespace:
                self._session.delete(row)
                count += 1
        return count

    def _cleanup_yaml_namespace(self, namespace: str) -> int:
        if self._yaml_fixture_root is None:
            return 0
        target = self._yaml_fixture_root / namespace
        if not target.exists():
            return 0
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return 1
