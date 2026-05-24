"""数据资产底座领域模型。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


AssetRefType = Literal["table", "field", "dataset", "cube", "view"]
SnapshotType = Literal["schema", "profile", "partition", "quality"]
SyncStatus = Literal["running", "success", "failed"]
UsageSourceType = Literal["sql_history", "cube", "view", "agent", "dashboard"]
LineageRelationType = Literal["upstream", "downstream"]


class AssetRef(BaseModel):
    """跨工作台共享的轻量资产引用。"""

    model_config = ConfigDict(populate_by_name=True)

    asset_type: AssetRefType
    source_id: str
    database: str
    name: str
    source_schema: Optional[str] = Field(default=None, alias="schema")
    field: Optional[str] = None
    snapshot_id: Optional[str] = None
    asset_id: Optional[str] = None

    @property
    def qualified_name(self) -> str:
        parts = [self.database]
        if self.source_schema:
            parts.append(self.source_schema)
        parts.append(self.name)
        if self.field:
            parts.append(self.field)
        return ".".join(part for part in parts if part)

    def for_field(self, field_name: str) -> "AssetRef":
        return self.model_copy(update={"asset_type": "field", "field": field_name})


class EvidenceBundle(BaseModel):
    """建模、投影和治理使用的证据包，不作为运行时真相源。"""

    subject: str
    asset_refs: List[AssetRef] = Field(default_factory=list)
    schema_snapshot: Dict[str, Any] = Field(default_factory=dict)
    sample_profile: Dict[str, Any] = Field(default_factory=dict)
    usage_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    lineage_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    drift_evidence: Dict[str, Any] = Field(default_factory=dict)
    projection_evidence: Dict[str, Any] = Field(default_factory=dict)
    collected_at: str = Field(default_factory=lambda: _utc_now())

    def to_dict(self) -> Dict[str, Any]:
        payload = self.model_dump(by_alias=True)
        payload["asset_refs"] = [
            {**ref.model_dump(by_alias=True), "qualified_name": ref.qualified_name}
            for ref in self.asset_refs
        ]
        payload["runtime_truth"] = False
        return payload


class AssetTable(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    source_id: str
    database: str
    name: str
    source_schema: Optional[str] = Field(default=None, alias="schema")
    title: Optional[str] = None
    description: Optional[str] = None
    layer: Optional[str] = None
    owner: Optional[str] = None
    table_type: str = "table"
    lifecycle_status: str = "active"
    row_count: Optional[int] = None
    partition_count: Optional[int] = None
    field_count: int = 0
    profile_status: str = "unknown"
    sync_status: str = "unknown"
    last_synced_at: Optional[str] = None
    last_profiled_at: Optional[str] = None
    extra: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    @property
    def asset_key(self) -> str:
        return ".".join(
            part
            for part in [self.source_id, self.database, self.source_schema, self.name]
            if part
        )

    def to_ref(self, *, snapshot_id: Optional[str] = None) -> AssetRef:
        return AssetRef(
            asset_type="table",
            source_id=self.source_id,
            database=self.database,
            schema=self.source_schema,
            name=self.name,
            snapshot_id=snapshot_id,
            asset_id=self.id,
        )


class AssetField(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    table_id: str
    source_id: str
    database: str
    table_name: str
    name: str
    source_schema: Optional[str] = Field(default=None, alias="schema")
    data_type: str
    ordinal: int = 0
    nullable: bool = True
    comment: Optional[str] = None
    profile: Dict[str, Any] = Field(default_factory=dict)
    sensitivity_level: Optional[str] = None
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    @field_validator("data_type")
    @classmethod
    def _normalize_data_type(cls, value: str) -> str:
        return str(value).upper()

    @property
    def asset_key(self) -> str:
        return ".".join(
            part
            for part in [self.source_id, self.database, self.source_schema, self.table_name, self.name]
            if part
        )

    def to_ref(self, *, snapshot_id: Optional[str] = None) -> AssetRef:
        return AssetRef(
            asset_type="field",
            source_id=self.source_id,
            database=self.database,
            schema=self.source_schema,
            name=self.table_name,
            field=self.name,
            snapshot_id=snapshot_id,
            asset_id=self.table_id,
        )


class AssetSnapshot(BaseModel):
    id: str
    table_id: str
    snapshot_type: SnapshotType
    payload: Dict[str, Any] = Field(default_factory=dict)
    sync_run_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: _utc_now())


class AssetSyncRun(BaseModel):
    id: str
    source_id: str
    status: SyncStatus = "running"
    started_at: str = Field(default_factory=lambda: _utc_now())
    finished_at: Optional[str] = None
    error_message: Optional[str] = None
    stats: Dict[str, Any] = Field(default_factory=dict)


class AssetUsage(BaseModel):
    id: str
    table_id: str
    field_id: Optional[str] = None
    source_type: UsageSourceType
    source_ref: str
    usage_count: int = 1
    last_used_at: str = Field(default_factory=lambda: _utc_now())
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AssetLineage(BaseModel):
    id: str
    source_table_id: str
    target_type: str
    target_ref: str
    relation_type: LineageRelationType = "downstream"
    target_table_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: _utc_now())


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
