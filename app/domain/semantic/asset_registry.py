"""语义资产 Registry 领域模型。"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field, model_validator


AssetType = Literal["cube", "ontology", "domain", "glossary", "binding", "view", "recipe", "policy"]
AssetStatus = Literal["draft", "active", "archived", "deleted"]
AssetSourceKind = Literal["human", "copilot", "seed", "test_fixture"]
RevisionStatus = Literal["draft", "validated", "published", "archived"]
ReleaseStatus = Literal["created", "published", "failed", "rolled_back"]
SnapshotStatus = Literal["active", "superseded", "failed"]

RUNTIME_MANIFEST_SCHEMA_VERSION = "semantic-runtime-manifest/v1"


class SemanticAsset(BaseModel):
    """生产语义资产主记录。"""

    id: str
    namespace: str = "default"
    asset_type: AssetType
    asset_key: str
    title: Optional[str] = None
    status: AssetStatus = "draft"
    current_revision_id: Optional[str] = None
    current_release_id: Optional[str] = None
    owner_principal_id: Optional[str] = None
    source_kind: AssetSourceKind = "human"
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    @property
    def registry_key(self) -> Tuple[str, str, str]:
        return (self.namespace, self.asset_type, self.asset_key)


class SemanticAssetRevision(BaseModel):
    """语义资产不可变版本。"""

    id: str
    asset_id: str
    revision_no: int
    revision_status: RevisionStatus = "draft"
    spec_json: Dict[str, Any]
    spec_checksum: Optional[str] = None
    change_summary: Optional[str] = None
    proposal_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: _utc_now())

    @model_validator(mode="after")
    def _fill_checksum(self) -> "SemanticAssetRevision":
        if not self.spec_checksum:
            self.spec_checksum = canonical_spec_checksum(self.spec_json)
        return self


class SemanticAssetDependency(BaseModel):
    """语义资产 revision 的依赖。"""

    id: str
    asset_revision_id: str
    depends_on_asset_id: str
    depends_on_revision_id: Optional[str] = None
    dependency_type: str
    required: bool = True
    created_at: str = Field(default_factory=lambda: _utc_now())


class SemanticRelease(BaseModel):
    """一次语义资产发布记录。"""

    id: str
    release_no: int
    namespace: str = "default"
    status: ReleaseStatus = "created"
    scope_json: Dict[str, Any] = Field(default_factory=dict)
    gate_result_json: Dict[str, Any] = Field(default_factory=dict)
    previous_release_id: Optional[str] = None
    rollback_of_release_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    published_by: Optional[str] = None
    published_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: _utc_now())


class SemanticReleaseAsset(BaseModel):
    """release 与资产 revision 的绑定。"""

    release_id: str
    asset_id: str
    revision_id: str
    asset_type: AssetType
    asset_key: str


class RuntimeAsset(BaseModel):
    """Runtime snapshot manifest 中的单个资产。"""

    asset_id: str
    asset_type: AssetType
    asset_key: str
    revision_id: str
    spec_checksum: str
    status: Literal["published"] = "published"


class RuntimeSnapshot(BaseModel):
    """Runtime 只读快照。"""

    id: str
    release_id: str
    namespace: str = "default"
    status: SnapshotStatus = "active"
    asset_manifest_json: Dict[str, Any]
    binding_manifest_json: Dict[str, Any]
    policy_manifest_json: Dict[str, Any]
    created_at: str = Field(default_factory=lambda: _utc_now())
    activated_at: Optional[str] = None
    superseded_at: Optional[str] = None

    def assets(self) -> List[RuntimeAsset]:
        return [RuntimeAsset(**item) for item in self.asset_manifest_json.get("assets", [])]


def canonical_spec_checksum(spec: Dict[str, Any]) -> str:
    """按固定 canonical JSON 算法生成 spec checksum。"""

    payload = json.dumps(spec, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
