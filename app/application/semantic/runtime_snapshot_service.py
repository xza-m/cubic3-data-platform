"""Runtime snapshot 读取服务。"""
from __future__ import annotations

from typing import Any

from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog
from app.domain.semantic.asset_registry import (
    RUNTIME_MANIFEST_SCHEMA_VERSION,
    RuntimeSnapshot,
    SemanticRelease,
)
from app.domain.semantic.ports.asset_registry_repository import IRuntimeSnapshotRepository


class RuntimeSnapshotService:
    """Runtime 只读 manifest 服务，不暴露 draft / YAML fallback。"""

    def __init__(self, runtime_snapshot_repository: IRuntimeSnapshotRepository):
        self._runtime_snapshot_repository = runtime_snapshot_repository

    def get_active_manifest(self, namespace: str = "default") -> dict[str, Any]:
        snapshot = self._runtime_snapshot_repository.get_active_snapshot(namespace)
        if snapshot is None:
            return {"ok": False, "error_code": "semantic_runtime_not_ready"}
        release = self._runtime_snapshot_repository.get_release(snapshot.release_id)
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
        asset_trace = self._asset_trace(snapshot)
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
        if release is None:
            return {
                "ok": False,
                "error_code": "semantic_runtime_release_not_found",
                "snapshot_id": snapshot.id,
                "release_id": snapshot.release_id,
            }
        return {
            "ok": True,
            "snapshot_id": snapshot.id,
            "release_id": snapshot.release_id,
            "version_pin": self._version_pin(snapshot=snapshot, release=release, asset_trace=asset_trace),
            "asset_trace": asset_trace,
            "binding_trace": self._manifest_trace(snapshot.binding_manifest_json, collection_key="bindings"),
            "policy_trace": self._manifest_trace(snapshot.policy_manifest_json, collection_key="policies"),
            "asset_manifest_json": snapshot.asset_manifest_json,
            "binding_manifest_json": snapshot.binding_manifest_json,
            "policy_manifest_json": snapshot.policy_manifest_json,
        }

    @staticmethod
    def _asset_trace(snapshot: RuntimeSnapshot) -> list[dict[str, Any]]:
        assets: list[dict[str, Any]] = []
        for asset in snapshot.asset_manifest_json.get("assets") or []:
            assets.append(
                {
                    "asset_id": asset.get("asset_id"),
                    "asset_type": asset.get("asset_type"),
                    "asset_key": asset.get("asset_key"),
                    "revision_id": asset.get("revision_id"),
                    "spec_checksum": asset.get("spec_checksum"),
                    "status": asset.get("status"),
                }
            )
        return assets

    @staticmethod
    def _version_pin(
        *,
        snapshot: RuntimeSnapshot,
        release: SemanticRelease | None,
        asset_trace: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "namespace": snapshot.namespace,
            "snapshot_id": snapshot.id,
            "snapshot_status": snapshot.status,
            "release_id": snapshot.release_id,
            "release_no": release.release_no if release is not None else None,
            "release_status": release.status if release is not None else None,
            "previous_release_id": release.previous_release_id if release is not None else None,
            "rollback_of_release_id": release.rollback_of_release_id if release is not None else None,
            "manifest_schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
            "asset_count": len(asset_trace),
            "asset_revision_ids": [item["revision_id"] for item in asset_trace if item.get("revision_id")],
        }

    @staticmethod
    def _manifest_trace(manifest: dict[str, Any], *, collection_key: str) -> dict[str, Any]:
        return {
            "schema_version": manifest.get("schema_version"),
            "count": len(manifest.get(collection_key) or []),
        }
