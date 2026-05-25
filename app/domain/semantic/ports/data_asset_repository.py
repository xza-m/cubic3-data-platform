"""数据资产底座仓储端口。"""
from __future__ import annotations

from typing import Any, Dict, Optional, Protocol

from app.domain.semantic.data_asset import (
    AssetField,
    AssetLineage,
    AssetSnapshot,
    AssetSyncRun,
    AssetTable,
    AssetUsage,
)


class IDataAssetRepository(Protocol):
    def upsert_table(self, table: AssetTable) -> AssetTable: ...

    def replace_fields(self, table_id: str, fields: list[AssetField]) -> None: ...

    def save_snapshot(self, snapshot: AssetSnapshot) -> AssetSnapshot: ...

    def start_sync_run(self, sync_run: AssetSyncRun) -> AssetSyncRun: ...

    def finish_sync_run(
        self,
        sync_run_id: str,
        *,
        status: str,
        error_message: Optional[str] = None,
        stats: Optional[Dict[str, object]] = None,
    ) -> Optional[AssetSyncRun]: ...

    def list_sync_runs(self, *, limit: int = 50) -> list[AssetSyncRun]: ...

    def get_sync_run(self, sync_run_id: str) -> Optional[AssetSyncRun]: ...

    def list_tables(
        self,
        *,
        keyword: str = "",
        page: int = 1,
        page_size: int = 20,
        source_id: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        sync_status: Optional[str] = None,
        lifecycle_status: Optional[str] = None,
    ) -> Dict[str, object]: ...

    def get_table(self, table_id: str) -> Optional[AssetTable]: ...

    def list_fields(self, table_id: str) -> list[AssetField]: ...

    def latest_snapshot(self, table_id: str, *, snapshot_type: str = "schema") -> Optional[AssetSnapshot]: ...

    def record_usage(self, usage: AssetUsage) -> AssetUsage: ...

    def list_usage(self, table_id: str) -> list[AssetUsage]: ...

    def record_lineage(self, lineage: AssetLineage) -> AssetLineage: ...

    def list_lineage(self, table_id: str) -> list[AssetLineage]: ...

    def radar_summary(self) -> Dict[str, Any]: ...
