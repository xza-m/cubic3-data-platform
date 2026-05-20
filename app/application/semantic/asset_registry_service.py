"""语义资产 Registry 应用服务。"""
from __future__ import annotations

from app.domain.semantic.asset_registry import SemanticAsset
from app.domain.semantic.ports.asset_registry_repository import (
    IAssetRegistryRepository,
    IRuntimeSnapshotRepository,
)


class AssetRegistryService:
    """封装跨仓储的资产生命周期规则。"""

    def __init__(
        self,
        registry_repository: IAssetRegistryRepository,
        *,
        runtime_snapshot_repository: IRuntimeSnapshotRepository,
    ):
        self._registry_repository = registry_repository
        self._runtime_snapshot_repository = runtime_snapshot_repository

    def delete_asset(self, namespace: str, asset_type: str, asset_key: str) -> dict:
        asset = self._registry_repository.get_asset(namespace, asset_type, asset_key)
        if asset is None:
            return {"ok": True, "deleted": False}
        active_snapshot = self._runtime_snapshot_repository.get_active_snapshot(namespace)
        if active_snapshot is not None:
            for runtime_asset in active_snapshot.assets():
                if runtime_asset.asset_id == asset.id:
                    return {
                        "ok": False,
                        "error_code": "asset_referenced_by_active_snapshot",
                        "asset_id": asset.id,
                        "snapshot_id": active_snapshot.id,
                    }
        deleted = SemanticAsset(**asset.model_dump())
        deleted.status = "deleted"
        self._registry_repository.create_or_update_asset(deleted, allowed_update_fields={"status"})
        return {"ok": True, "deleted": True, "asset_id": asset.id}
