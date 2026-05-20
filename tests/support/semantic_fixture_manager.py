"""语义专项测试资产生命周期管理。"""
from __future__ import annotations

import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.infrastructure.governance.models import GovernanceAuditTraceORM
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
            proposal_ids = self._payload_namespace_ids(SemanticModelingProposalORM, namespace)
            deleted["proposals"] = self._delete_payload_namespace(
                SemanticModelingProposalORM,
                namespace,
                ids=proposal_ids,
            )
            deleted["sessions"] = self._delete_session_namespace(namespace, proposal_ids)
            deleted["audit_traces"] = self._delete_audit_traces(namespace, release_ids)
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

    def _payload_namespace_ids(self, model, namespace: str) -> list[str]:
        rows = self._session.query(model).all()
        return [
            row.id
            for row in rows
            if self._payload_matches_namespace(row.payload_json or {}, namespace)
        ]

    def _delete_payload_namespace(self, model, namespace: str, *, ids: list[str] | None = None) -> int:
        rows = self._session.query(model).all()
        count = 0
        for row in rows:
            payload = row.payload_json or {}
            if (ids is not None and row.id in ids) or self._payload_matches_namespace(payload, namespace):
                self._session.delete(row)
                count += 1
        return count

    def _delete_session_namespace(self, namespace: str, proposal_ids: list[str]) -> int:
        proposal_id_set = set(proposal_ids)
        rows = self._session.query(SemanticModelingAgentSessionORM).all()
        count = 0
        for row in rows:
            payload = row.payload_json or {}
            if self._payload_matches_namespace(payload, namespace) or self._session_links_proposal(
                payload,
                proposal_id_set,
            ):
                self._session.delete(row)
                count += 1
        return count

    @classmethod
    def _payload_matches_namespace(cls, payload: Any, namespace: str) -> bool:
        if isinstance(payload, dict):
            for key, value in payload.items():
                if key in {"namespace", "semantic_namespace", "test_namespace"} and str(value) == namespace:
                    return True
                if cls._payload_matches_namespace(value, namespace):
                    return True
            return False
        if isinstance(payload, list):
            return any(cls._payload_matches_namespace(item, namespace) for item in payload)
        return False

    @classmethod
    def _session_links_proposal(cls, payload: dict[str, Any], proposal_ids: set[str]) -> bool:
        if not proposal_ids:
            return False
        current = str(payload.get("current_proposal_id") or "")
        if current in proposal_ids:
            return True
        state = payload.get("workbench_state") if isinstance(payload.get("workbench_state"), dict) else {}
        advanced_refs = state.get("advanced_refs") if isinstance(state.get("advanced_refs"), dict) else {}
        proposal_summary = state.get("proposal_summary") if isinstance(state.get("proposal_summary"), dict) else {}
        return any(
            str(value or "") in proposal_ids
            for value in (
                advanced_refs.get("proposal_id"),
                proposal_summary.get("id"),
            )
        )

    def _delete_audit_traces(self, namespace: str, release_ids: list[str]) -> int:
        release_id_set = set(release_ids)
        rows = self._session.query(GovernanceAuditTraceORM).filter(
            GovernanceAuditTraceORM.target_type == "semantic_release"
        )
        count = 0
        for row in rows:
            if row.target_name in release_id_set or self._payload_matches_namespace(row.traceability or {}, namespace):
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
