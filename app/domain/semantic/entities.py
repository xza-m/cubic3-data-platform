"""语义层领域实体 — 纯 Pydantic 模型，无框架依赖"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


# ──────────────────────────────────────────────
# Cube 子结构
# ──────────────────────────────────────────────

class ForeignKeyDef(BaseModel):
    cube: str
    field: str


class EnumSourceDef(BaseModel):
    type: str = "meta_dict"
    dict_type: str


class DimensionDef(BaseModel):
    title: str
    type: Literal["string", "number", "time", "boolean"]
    sql: str
    description: Optional[str] = None
    source_data_type: Optional[str] = None
    format: Optional[str] = None
    synonyms: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    primary_key: bool = False
    foreign_key: Optional[ForeignKeyDef] = None
    enum: Optional[Dict[Union[int, str], str]] = None
    enum_source: Optional[EnumSourceDef] = None


class MeasureDef(BaseModel):
    title: str
    type: Literal["count", "count_distinct", "sum", "avg", "min", "max", "number"]
    sql: str
    description: Optional[str] = None
    source_data_type: Optional[str] = None
    synonyms: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    certified: bool = False
    format: Optional[str] = None
    unit: Optional[str] = None
    non_additive: bool = False


class SegmentDef(BaseModel):
    title: str
    sql: str


class JoinDef(BaseModel):
    cube: str
    type: Literal["left", "inner", "right", "full", "left_each"] = "left"
    relationship: str = "N:1"
    sql: str
    context: Optional[str] = None


class PartitionDef(BaseModel):
    field: str
    type: Literal["date", "string"] = "date"
    format: str = "yyyyMMdd"
    max_range_days: int = 90
    latest_expr: Optional[str] = None


class DefaultFilterDef(BaseModel):
    sql: str
    description: Optional[str] = None


# ──────────────────────────────────────────────
# Cube 主体
# ──────────────────────────────────────────────

class CubeDefinition(BaseModel):
    name: str
    title: str
    description: Optional[str] = None
    table: str
    domain_id: Optional[str] = None
    source_id: Optional[int] = None
    source_database: Optional[str] = None
    source_schema: Optional[str] = None
    source_sql: Optional[str] = None
    source_dataset_id: Optional[int] = None
    source_dataset_type: Optional[str] = None
    data_source: str = "maxcompute"
    status: Literal["draft", "active", "deprecated"] = "active"
    grain: Optional[str] = None
    entity_key: Optional[str] = None
    partition: Optional[PartitionDef] = None
    default_filters: List[DefaultFilterDef] = Field(default_factory=list)
    dimensions: Dict[str, DimensionDef] = Field(default_factory=dict)
    measures: Dict[str, MeasureDef] = Field(default_factory=dict)
    segments: Dict[str, SegmentDef] = Field(default_factory=dict)
    joins: Dict[str, JoinDef] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_required_fields(self) -> "CubeDefinition":
        if not self.dimensions:
            raise ValueError(f"Cube '{self.name}' must have at least one dimension")
        if not self.measures:
            raise ValueError(f"Cube '{self.name}' must have at least one measure")
        return self


# ──────────────────────────────────────────────
# View 子结构
# ──────────────────────────────────────────────

class ViewCubeRef(BaseModel):
    join_path: str
    includes: Union[List[str], Literal["*"]]
    excludes: List[str] = Field(default_factory=list)
    prefix: bool = False


class ViewDefinition(BaseModel):
    name: str
    title: str
    description: Optional[str] = None
    public: bool = True
    cubes: List[ViewCubeRef] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_cubes(self) -> "ViewDefinition":
        if not self.cubes:
            raise ValueError(f"View '{self.name}' must reference at least one Cube")
        return self


# ──────────────────────────────────────────────
# Recipe
# ──────────────────────────────────────────────

class RecipeExample(BaseModel):
    question: str
    dsl: Dict[str, Any]
    notes: Optional[str] = None


class RecipeDefinition(BaseModel):
    name: str
    title: str
    tags: List[str] = Field(default_factory=list)
    examples: List[RecipeExample] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_examples(self) -> "RecipeDefinition":
        if not self.examples:
            raise ValueError(f"Recipe '{self.name}' must have at least one example")
        return self

    def extract_cube_names(self) -> set[str]:
        """从所有 examples 的 DSL 中提取引用的 Cube/View 名称"""
        names: set[str] = set()
        for ex in self.examples:
            dsl = ex.dsl
            for field_ref in self._collect_field_refs(dsl):
                parts = field_ref.split(".", 1)
                if len(parts) == 2:
                    names.add(parts[0])
        return names

    @staticmethod
    def _collect_field_refs(dsl: Dict[str, Any]) -> List[str]:
        """收集 DSL 中所有 cube_name.field 形式的引用"""
        refs: List[str] = []
        for ref in dsl.get("measures", []):
            if isinstance(ref, str):
                refs.append(ref)
        for ref in dsl.get("dimensions", []):
            if isinstance(ref, str):
                refs.append(ref)
        for seg in dsl.get("segments", []):
            if isinstance(seg, str):
                refs.append(seg)
        for f in dsl.get("filters", []):
            if isinstance(f, dict) and "dimension" in f:
                refs.append(f["dimension"])
            elif isinstance(f, dict) and "member" in f:
                refs.append(f["member"])
        for td in dsl.get("time_dimensions", []):
            if isinstance(td, dict) and "dimension" in td:
                refs.append(td["dimension"])
        for order_pair in dsl.get("order", []):
            if isinstance(order_pair, list) and order_pair:
                refs.append(order_pair[0])
        return refs


# ──────────────────────────────────────────────
# Query DSL（Agent → Compiler 的输入）
# ──────────────────────────────────────────────

class FilterDef(BaseModel):
    dimension: Optional[str] = None
    member: Optional[str] = None
    operator: str = "equals"
    values: List[Any] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_target(self) -> "FilterDef":
        if not self.dimension and not self.member:
            raise ValueError("Filter must specify either 'dimension' or 'member'")
        return self

    @property
    def target(self) -> str:
        return self.dimension or self.member or ""


class TimeDimensionDef(BaseModel):
    dimension: str
    granularity: Optional[str] = None
    date_range: Optional[List[str]] = None


class QueryDSL(BaseModel):
    measures: List[str] = Field(default_factory=list)
    dimensions: List[str] = Field(default_factory=list)
    filters: List[FilterDef] = Field(default_factory=list)
    time_dimensions: List[TimeDimensionDef] = Field(default_factory=list)
    segments: List[str] = Field(default_factory=list)
    order: List[List[str]] = Field(default_factory=list)
    limit: Optional[int] = None
    join_path: Optional[List[str]] = None
    domain_id: Optional[str] = None
    domain_code: Optional[str] = None


# ──────────────────────────────────────────────
# Domain / 业务上下文与资产组织
# ──────────────────────────────────────────────

class DomainJoinDef(BaseModel):
    """历史 Domain YAML 兼容字段。

    Domain 已收窄为业务上下文和资产组织对象，不再承载 Join 语义。
    关系执行语义归 Cube.joins，业务关系语义归 Ontology。
    """

    name: str
    source_cube: str
    target_cube: str
    source_field: str
    target_field: str
    join_type: Literal["left", "inner", "right", "full"] = "left"
    cardinality: Literal["1:1", "N:1", "1:N"] = "N:1"
    aggregation_strategy: Literal[
        "none",
        "aggregate_before_join",
        "latest_snapshot",
        "distinct_on_target",
    ] = "none"
    description: Optional[str] = None


class CatalogDefinition(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    status: Literal["active", "archived"] = "active"
    sort_order: int = 100


class DomainDefinition(BaseModel):
    id: Optional[str] = None
    code: str
    name: str
    description: Optional[str] = None
    catalog_code: Optional[str] = None
    status: Literal["draft", "active", "archived"] = "draft"
    owner: Optional[str] = None
    cubes: List[str] = Field(default_factory=list)
    joins: List[DomainJoinDef] = Field(default_factory=list)
    ontology_refs: Dict[str, Any] = Field(default_factory=dict)
    default_context: Dict[str, Any] = Field(default_factory=dict)
    agent_hints: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _normalize_id_and_validate(self) -> "DomainDefinition":
        self.id = self.id or self.code
        if len(set(self.cubes)) != len(self.cubes):
            raise ValueError(f"领域 '{self.code}' 包含重复 Cube 成员")
        return self


def _generate_semantic_code(name: str, prefix: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    if normalized:
        return normalized
    digest = int(hashlib.sha1(name.encode("utf-8")).hexdigest()[:10], 16) % (36 ** 8)
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    chars: List[str] = []
    while digest:
        digest, rem = divmod(digest, 36)
        chars.append(alphabet[rem])
    suffix = "".join(reversed(chars or ["0"])).rjust(8, "0")
    return f"{prefix}_{suffix}"


def generate_domain_code(name: str) -> str:
    """根据领域名称生成稳定 code。"""
    return _generate_semantic_code(name, "domain")


def generate_catalog_code(name: str) -> str:
    """根据目录名称生成稳定 code。"""
    return _generate_semantic_code(name, "catalog")
