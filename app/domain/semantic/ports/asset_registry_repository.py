"""语义资产 Registry 仓储端口。"""
from __future__ import annotations

from typing import Dict, Optional, Protocol

from app.domain.semantic.asset_registry import (
    RuntimeAsset,
    RuntimeSnapshot,
    SemanticRelease,
    SemanticAsset,
    SemanticAssetDependency,
    SemanticAssetRevision,
)


class IAssetRegistryRepository(Protocol):
    def get_asset(self, namespace: str, asset_type: str, asset_key: str) -> Optional[SemanticAsset]:
        ...

    def create_or_update_asset(
        self,
        asset: SemanticAsset,
        *,
        allowed_update_fields: Optional[set[str]] = None,
    ) -> SemanticAsset:
        ...

    def append_revision(
        self,
        asset_id: str,
        spec: Dict,
        *,
        proposal_id: Optional[str] = None,
        actor: Optional[str] = None,
        force_new_revision: bool = False,
    ) -> SemanticAssetRevision:
        ...

    def get_revision(self, revision_id: str) -> Optional[SemanticAssetRevision]:
        ...

    def list_revisions(self, asset_id: str) -> list[SemanticAssetRevision]:
        ...

    def replace_dependencies(
        self,
        revision_id: str,
        dependencies: list[SemanticAssetDependency],
    ) -> None:
        ...


class IRuntimeSnapshotRepository(Protocol):
    def get_active_snapshot(self, namespace: str = "default") -> Optional[RuntimeSnapshot]:
        ...

    def get_release(self, release_id: str) -> Optional[SemanticRelease]:
        ...

    def list_releases(
        self,
        namespace: str = "default",
        *,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SemanticRelease], int]:
        ...

    def get_snapshot_by_release_id(self, release_id: str) -> Optional[RuntimeSnapshot]:
        ...

    def resolve_asset(
        self,
        snapshot_id: str,
        asset_type: str,
        asset_key: str,
    ) -> Optional[RuntimeAsset]:
        ...

    def list_assets(
        self,
        snapshot_id: str,
        asset_type: Optional[str] = None,
    ) -> list[RuntimeAsset]:
        ...
