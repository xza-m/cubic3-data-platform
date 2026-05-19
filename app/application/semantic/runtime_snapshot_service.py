"""Runtime snapshot 读取服务。"""
from __future__ import annotations

from typing import Any

from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog
from app.domain.semantic.asset_registry import RUNTIME_MANIFEST_SCHEMA_VERSION
from app.domain.semantic.ports.asset_registry_repository import IRuntimeSnapshotRepository


class RuntimeSnapshotService:
    """Runtime 只读 manifest 服务，不暴露 draft / YAML fallback。"""

    def __init__(self, runtime_snapshot_repository: IRuntimeSnapshotRepository):
        self._runtime_snapshot_repository = runtime_snapshot_repository

    def get_active_manifest(self, namespace: str = "default") -> dict[str, Any]:
        snapshot = self._runtime_snapshot_repository.get_active_snapshot(namespace)
        if snapshot is None:
            return {"ok": False, "error_code": "semantic_runtime_not_ready"}
        for manifest_name, manifest in (
            ("asset_manifest_json", snapshot.asset_manifest_json),
            ("binding_manifest_json", snapshot.binding_manifest_json),
            ("policy_manifest_json", snapshot.policy_manifest_json),
        ):
            if manifest.get("schema_version") != RUNTIME_MANIFEST_SCHEMA_VERSION:
                return {
                    "ok": False,
                    "error_code": "semantic_runtime_manifest_unsupported",
                    "manifest": manifest_name,
                    "schema_version": manifest.get("schema_version"),
                }
        for asset in snapshot.asset_manifest_json.get("assets") or []:
            if asset.get("status") != "published":
                continue
            if not (asset.get("spec") or asset.get("spec_json")):
                return {
                    "ok": False,
                    "error_code": "semantic_runtime_manifest_invalid",
                    "reason": "published_asset_missing_spec",
                    "asset_key": asset.get("asset_key"),
                    "asset_type": asset.get("asset_type"),
                }
        try:
            RuntimeSemanticCatalog.from_manifest(
                {
                    "snapshot_id": snapshot.id,
                    "release_id": snapshot.release_id,
                    "asset_manifest_json": snapshot.asset_manifest_json,
                }
            )
        except ValueError as exc:
            return {
                "ok": False,
                "error_code": "semantic_runtime_manifest_invalid",
                "reason": "published_asset_invalid_spec",
                "details": str(exc),
            }
        return {
            "ok": True,
            "snapshot_id": snapshot.id,
            "release_id": snapshot.release_id,
            "asset_manifest_json": snapshot.asset_manifest_json,
            "binding_manifest_json": snapshot.binding_manifest_json,
            "policy_manifest_json": snapshot.policy_manifest_json,
        }
