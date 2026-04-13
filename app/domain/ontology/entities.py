"""业务语义层实体定义。"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class BusinessObject(BaseModel):
    name: str
    title: str
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessProperty(BaseModel):
    name: str
    title: str
    object_name: str
    property_type: Literal["string", "number", "time", "boolean", "enum", "unknown"] = "unknown"
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessMetric(BaseModel):
    name: str
    title: str
    object_name: str
    semantic_formula: str
    description: Optional[str] = None
    semantic_labels: List[str] = Field(default_factory=list)
    measure_refs: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessRelation(BaseModel):
    name: str
    title: str
    source_object_name: str
    target_object_name: str
    relation_type: Literal["owns", "submits", "belongs_to", "linked_to", "custom"] = "linked_to"
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessAction(BaseModel):
    name: str
    title: str
    object_name: str
    trigger_time_property: Optional[str] = None
    description: Optional[str] = None
    event_cube_refs: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"


class GlossaryEntry(BaseModel):
    term: str
    canonical_name: str
    entry_type: Literal["object", "property", "metric", "action", "relation", "term"] = "term"
    aliases: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    status: Literal["draft", "active", "deprecated"] = "draft"


class PolicyMetadata(BaseModel):
    name: str
    target_type: Literal["object", "property", "metric", "action"] = "object"
    target_name: str
    visibility: Literal["public", "restricted", "private"] = "restricted"
    allowed_roles: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    status: Literal["draft", "active", "deprecated"] = "draft"


class OntologyHistoryEvent(BaseModel):
    id: str
    entity_type: str
    entity_name: str
    action: Literal["saved", "published"] = "saved"
    status: Literal["draft", "active", "deprecated"] | str = "draft"
    summary: Optional[str] = None
    validation: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str


class GovernanceAuditTrace(BaseModel):
    id: str
    target_type: str
    target_name: str
    viewer_roles: List[str] = Field(default_factory=list)
    route_type: str = "direct"
    execution_target: str
    decision: Literal["allow", "blocked", "not_configured"] | str
    policy: Dict[str, Any] | None = None
    traceability: Dict[str, Any] = Field(default_factory=dict)
    reason: Optional[str] = None
    timestamp: str
