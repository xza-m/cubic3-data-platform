"""业务语义层实体定义。"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class MeasureRef(BaseModel):
    """Metric → Cube measure 的显式绑定引用。

    `primary` 是唯一编译入口；`equivalent` 仅声明同口径替代实现，不参与编译。
    """

    ref: str
    role: Literal["primary", "equivalent"] = "primary"


class CubeBinding(BaseModel):
    """BusinessObject → Cube 的显式绑定。

    `primary` 至多一个，是对象画像与关系解析的默认入口；
    `detail` 用于明细扩展表，`event` 用于事件事实。
    `entity_key` 必须是目标 cube 内的维度（发布期校验）。
    """

    cube: str
    role: Literal["primary", "detail", "event"] = "primary"
    entity_key: Optional[str] = None


def normalize_measure_refs(value: Any) -> List[Dict[str, Any]]:
    """把 measure_refs 的存量形态（字符串数组 / 混合）归一化为结构化形态。

    兼容输入：``["cube.m"]``、``[{"ref": "cube.m"}]``、``[MeasureRef(...)]``。
    无显式 primary 时，第一个条目提升为 primary。
    """
    if not value:
        return []
    normalized: List[Dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            ref = item.strip()
            if ref:
                normalized.append({"ref": ref, "role": "equivalent"})
        elif isinstance(item, MeasureRef):
            normalized.append({"ref": item.ref, "role": item.role})
        elif isinstance(item, dict):
            ref = str(item.get("ref") or "").strip()
            if ref:
                role = item.get("role") if item.get("role") in ("primary", "equivalent") else "equivalent"
                normalized.append({"ref": ref, "role": role})
    if normalized and not any(item["role"] == "primary" for item in normalized):
        normalized[0]["role"] = "primary"
    return normalized


def measure_ref_strings(value: Any) -> List[str]:
    """从任意形态的 measure_refs 中提取 ref 字符串列表（保持顺序）。"""
    return [item["ref"] for item in normalize_measure_refs(value)]


def primary_measure_ref(value: Any) -> Optional[str]:
    """从任意形态的 measure_refs 中取唯一编译入口（primary ref）。"""
    for item in normalize_measure_refs(value):
        if item["role"] == "primary":
            return item["ref"]
    return None


def normalize_cube_bindings(value: Any) -> List[Dict[str, Any]]:
    """归一化 cube_bindings；兼容字符串（视为 primary 绑定）与 dict 形态。"""
    if not value:
        return []
    normalized: List[Dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            cube = item.strip()
            if cube:
                normalized.append({"cube": cube, "role": "primary", "entity_key": None})
        elif isinstance(item, CubeBinding):
            normalized.append({"cube": item.cube, "role": item.role, "entity_key": item.entity_key})
        elif isinstance(item, dict):
            cube = str(item.get("cube") or "").strip()
            if cube:
                role = item.get("role") if item.get("role") in ("primary", "detail", "event") else "primary"
                normalized.append({"cube": cube, "role": role, "entity_key": item.get("entity_key")})
    return normalized


class BusinessObject(BaseModel):
    name: str
    title: str
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    cube_bindings: List[CubeBinding] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"

    @field_validator("cube_bindings", mode="before")
    @classmethod
    def _normalize_cube_bindings(cls, value: Any) -> Any:
        return normalize_cube_bindings(value)

    @field_validator("cube_bindings")
    @classmethod
    def _validate_primary_binding(cls, value: List[CubeBinding]) -> List[CubeBinding]:
        primary_count = sum(1 for item in value if item.role == "primary")
        if primary_count > 1:
            raise ValueError("cube_bindings 中 role=primary 的绑定至多一个")
        return value

    def primary_cube_binding(self) -> Optional[CubeBinding]:
        for binding in self.cube_bindings:
            if binding.role == "primary":
                return binding
        return None


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
    measure_refs: List[MeasureRef] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"

    @field_validator("measure_refs", mode="before")
    @classmethod
    def _normalize_measure_refs(cls, value: Any) -> Any:
        return normalize_measure_refs(value)

    @field_validator("measure_refs")
    @classmethod
    def _validate_primary_ref(cls, value: List[MeasureRef]) -> List[MeasureRef]:
        primary_count = sum(1 for item in value if item.role == "primary")
        if primary_count > 1:
            raise ValueError("measure_refs 中 role=primary 的引用必须唯一")
        return value

    def primary_measure_ref(self) -> Optional[str]:
        for item in self.measure_refs:
            if item.role == "primary":
                return item.ref
        return None

    def measure_ref_strings(self) -> List[str]:
        return [item.ref for item in self.measure_refs]


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
    principal_id: Optional[str] = None
    semantic_plan_id: Optional[str] = None
    sql_hash: Optional[str] = None
    gateway_query_id: Optional[str] = None
    maxcompute_task_id: Optional[str] = None
    viewer_roles: List[str] = Field(default_factory=list)
    route_type: str = "direct"
    execution_target: str
    decision: Literal["allow", "blocked", "not_configured"] | str
    policy: Dict[str, Any] | None = None
    policy_decision: Dict[str, Any] = Field(default_factory=dict)
    traceability: Dict[str, Any] = Field(default_factory=dict)
    reason: Optional[str] = None
    timestamp: str
