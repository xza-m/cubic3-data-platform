# Semantic Field Candidate Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地“字段候选层”，让物理表、Dataset、数据资产证据进入 Cube / Ontology 草案前统一经过类型映射、字段角色判断、指标语义推断、风险 Review 和发布门禁。

**Architecture:** 数据资产底座继续只做元数据事实层，输出 `AssetRef + EvidenceBundle`。后端新增 `field_candidates` 应用模块，统一 `PhysicalTypeMapper / TypeCompatibilityPolicy / SemanticFieldClassifier / MeasureSemanticsInferer / FieldCandidateService`；Cube 草案生成从 `FieldCandidateSet` 或 inline candidate set 进入，旧 `draft-from-source` 仅作为 compatibility facade。正式 runtime 只读取已发布 Cube / Ontology / Binding / Policy，不读取候选层。

**Tech Stack:** Flask、dependency-injector、Pydantic/domain dataclass、pytest、React/Vite、TanStack Query、Vitest、Playwright、现有 Makefile 验证入口。

---

## 0. 范围检查

本计划覆盖一个完整交付切片，包含后端候选层、Cube 草案兼容改造、Copilot 草案证据、API、前端文案与最小候选 Review、测试和文档。它横跨多个子系统，但每个任务都能单独测试；推荐用 subagent 并行执行以下工作包：

- Task 1 到 Task 3：后端候选层内核，可由一个后端 worker 顺序执行。
- Task 4 到 Task 6：Cube / Source / Copilot / API 集成，可在 Task 1 到 Task 3 合并后由一个后端 worker 执行。
- Task 7：前端 API 与工作台文案，可与 Task 4 到 Task 6 并行，但最终需要和 API 契约对齐。
- Task 8：E2E 与文档收口，依赖前面任务完成。

不在本计划内：

- 不新增 `semantic_field_candidates` 独立 SQL 表。
- 不做长期资产层 override。
- 不把数据资产底座变成发布入口。
- 不改造完整审批流和多租户治理。

## 1. 目标文件结构

新增：

```text
app/application/semantic/field_candidates/__init__.py
app/application/semantic/field_candidates/types.py
app/application/semantic/field_candidates/classifier.py
app/application/semantic/field_candidates/service.py
tests/unit/application/semantic/field_candidates/test_types.py
tests/unit/application/semantic/field_candidates/test_classifier.py
tests/unit/application/semantic/field_candidates/test_service.py
tests/integration/semantic/test_field_candidate_api.py
frontend/src/v2/api/semantic-field-candidates.test.ts
frontend/tests/e2e-v2/p35-field-candidate-layer.spec.ts
```

修改：

```text
app/application/semantic/__init__.py
app/application/semantic/cube_modeling_service.py
app/application/semantic/cube_modeling_source_service.py
app/application/semantic/modeling_draft_builder.py
app/application/semantic/schema_sync_service.py
app/di/container.py
app/interfaces/api/v1/semantic.py
frontend/src/v2/api/semantic.ts
frontend/src/v2/hooks/semantic.ts
frontend/src/v2/pages/semantic/cubes/CubeCreate.tsx
frontend/src/v2/pages/semantic/cubes/CubeCreate.test.tsx
frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx
frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
docs/architecture/semantic-field-candidate-layer.md
docs/architecture/semantic-data-asset-foundation.md
docs/quality/testing.md
```

## 2. 执行依赖图

```text
Task 1 TypeCompatibilityPolicy
  -> Task 2 Field classifier
  -> Task 3 FieldCandidateService
  -> Task 4 Cube draft from candidates
  -> Task 5 source service + Copilot integration
  -> Task 6 API contracts
  -> Task 8 E2E + docs

Task 7 frontend can start after Task 6 contract shape is stable.
```

## 3. 任务拆分

### Task 1: 统一物理类型映射与兼容策略

**Files:**
- Create: `app/application/semantic/field_candidates/__init__.py`
- Create: `app/application/semantic/field_candidates/types.py`
- Create: `tests/unit/application/semantic/field_candidates/test_types.py`
- Modify: `app/application/semantic/schema_sync_service.py`
- Modify: `tests/unit/application/semantic/test_schema_sync.py`
- Modify: `app/application/semantic/__init__.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/application/semantic/field_candidates/test_types.py`:

```python
from app.application.semantic.field_candidates.types import (
    PhysicalTypeMapper,
    TypeCompatibilityPolicy,
)


def test_parse_numeric_physical_types_with_precision_and_aliases():
    mapper = PhysicalTypeMapper()

    decimal_type = mapper.parse("DECIMAL(10,4)")
    assert decimal_type.normalized_type == "decimal"
    assert decimal_type.family == "number"
    assert decimal_type.precision == 10
    assert decimal_type.scale == 4

    assert mapper.parse("DOUBLE PRECISION").normalized_type == "double"
    assert mapper.parse("NUMERIC(20,6)").family == "number"
    assert mapper.parse("FLOAT(24)").family == "number"
    assert mapper.parse("INT64").normalized_type == "bigint"


def test_type_compatibility_policy_does_not_treat_number_as_role():
    policy = TypeCompatibilityPolicy()

    assert policy.is_compatible("DECIMAL(10,4)", "number") is True
    assert policy.is_compatible("DOUBLE PRECISION", "number") is True
    assert policy.is_compatible("VARCHAR(32)", "number") is False
    assert policy.semantic_primitive("DECIMAL(10,4)") == "number"
    assert policy.semantic_primitive("VARCHAR(32)") == "string"
    assert policy.semantic_primitive("JSON") == "json"
```

Append to `tests/unit/application/semantic/test_schema_sync.py`:

```python
def test_schema_sync_uses_shared_type_compatibility_policy_for_numeric_families():
    cube = _make_cube(dims={
        "decimal_value": DimensionDef(title="Decimal", type="number", sql="{CUBE}.decimal_value"),
        "float_value": DimensionDef(title="Float", type="number", sql="{CUBE}.float_value"),
        "double_value": DimensionDef(title="Double", type="number", sql="{CUBE}.double_value"),
    })
    inspector = MockInspector(tables={
        "test_table": [
            {"name": "decimal_value", "type": "DECIMAL(10,4)"},
            {"name": "float_value", "type": "FLOAT(24)"},
            {"name": "double_value", "type": "DOUBLE PRECISION"},
        ]
    })
    svc = SchemaSyncService(MockCubeRepo([cube]), inspector)

    report = svc.check_all()

    assert [d for d in report.drifts if d.kind == "type_mismatch"] == []
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/field_candidates/test_types.py \
  tests/unit/application/semantic/test_schema_sync.py::test_schema_sync_uses_shared_type_compatibility_policy_for_numeric_families \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.application.semantic.field_candidates'
```

- [ ] **Step 3: 新增类型策略模块**

Create `app/application/semantic/field_candidates/__init__.py`:

```python
"""字段候选层公共入口。"""

from .types import PhysicalTypeDescriptor, PhysicalTypeMapper, TypeCompatibilityPolicy

__all__ = [
    "PhysicalTypeDescriptor",
    "PhysicalTypeMapper",
    "TypeCompatibilityPolicy",
]
```

Create `app/application/semantic/field_candidates/types.py`:

```python
"""字段候选层的物理类型映射与兼容策略。"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Optional


@dataclass(frozen=True)
class PhysicalTypeDescriptor:
    raw_type: str
    normalized_type: str
    family: str
    precision: Optional[int] = None
    scale: Optional[int] = None
    nullable: Optional[bool] = None
    source_dialect: Optional[str] = None


class PhysicalTypeMapper:
    """把数据源物理类型归一到平台基础类型族。"""

    _NUMBER_TYPES = {
        "tinyint": "tinyint",
        "int8": "tinyint",
        "byte": "tinyint",
        "smallint": "smallint",
        "int16": "smallint",
        "int": "int",
        "integer": "int",
        "int32": "int",
        "bigint": "bigint",
        "int64": "bigint",
        "long": "bigint",
        "decimal": "decimal",
        "numeric": "decimal",
        "number": "decimal",
        "float": "float",
        "float4": "float",
        "real": "float",
        "double": "double",
        "float8": "double",
        "double precision": "double",
    }
    _STRING_TYPES = {
        "string": "string",
        "varchar": "varchar",
        "char": "char",
        "text": "string",
    }
    _TIME_TYPES = {
        "date": "date",
        "datetime": "datetime",
        "timestamp": "timestamp",
    }
    _BOOLEAN_TYPES = {
        "bool": "boolean",
        "boolean": "boolean",
    }
    _JSON_TYPES = {
        "json": "json",
        "map": "json",
        "array": "json",
        "struct": "json",
    }

    def parse(
        self,
        physical_type: str,
        *,
        nullable: Optional[bool] = None,
        source_dialect: Optional[str] = None,
    ) -> PhysicalTypeDescriptor:
        raw_type = re.sub(r"\s+", " ", str(physical_type or "").strip())
        if not raw_type:
            return PhysicalTypeDescriptor(
                raw_type="",
                normalized_type="unknown",
                family="unknown",
                nullable=nullable,
                source_dialect=source_dialect,
            )

        precision, scale = self._parse_precision(raw_type)
        base_type = raw_type.split("(", 1)[0].strip().lower()
        if base_type in self._NUMBER_TYPES:
            return PhysicalTypeDescriptor(raw_type, self._NUMBER_TYPES[base_type], "number", precision, scale, nullable, source_dialect)
        if base_type in self._STRING_TYPES:
            return PhysicalTypeDescriptor(raw_type, self._STRING_TYPES[base_type], "string", precision, scale, nullable, source_dialect)
        if base_type in self._TIME_TYPES:
            return PhysicalTypeDescriptor(raw_type, self._TIME_TYPES[base_type], "time", precision, scale, nullable, source_dialect)
        if base_type in self._BOOLEAN_TYPES:
            return PhysicalTypeDescriptor(raw_type, "boolean", "boolean", precision, scale, nullable, source_dialect)
        if base_type in self._JSON_TYPES:
            return PhysicalTypeDescriptor(raw_type, "json", "json", precision, scale, nullable, source_dialect)
        if base_type.startswith("varchar"):
            return PhysicalTypeDescriptor(raw_type, "varchar", "string", precision, scale, nullable, source_dialect)
        if base_type.startswith("char"):
            return PhysicalTypeDescriptor(raw_type, "char", "string", precision, scale, nullable, source_dialect)
        if base_type.startswith("timestamp"):
            return PhysicalTypeDescriptor(raw_type, "timestamp", "time", precision, scale, nullable, source_dialect)
        return PhysicalTypeDescriptor(raw_type, base_type or "unknown", "unknown", precision, scale, nullable, source_dialect)

    @staticmethod
    def _parse_precision(raw_type: str) -> tuple[Optional[int], Optional[int]]:
        match = re.search(r"\((\d+)(?:\s*,\s*(\d+))?\)", raw_type)
        if not match:
            return None, None
        precision = int(match.group(1))
        scale = int(match.group(2)) if match.group(2) else None
        return precision, scale


class TypeCompatibilityPolicy:
    """Cube 声明类型与物理类型的兼容策略。"""

    _COMPATIBLE = {
        "string": {"string", "number", "boolean"},
        "number": {"number"},
        "time": {"time", "string"},
        "boolean": {"boolean", "number"},
    }

    def __init__(self, mapper: PhysicalTypeMapper | None = None):
        self._mapper = mapper or PhysicalTypeMapper()

    def descriptor(self, physical_type: str) -> PhysicalTypeDescriptor:
        return self._mapper.parse(physical_type)

    def semantic_primitive(self, physical_type: str) -> str:
        return self.descriptor(physical_type).family

    def is_compatible(self, physical_type: str, semantic_type: str) -> bool:
        descriptor = self.descriptor(physical_type)
        expected = self._COMPATIBLE.get(str(semantic_type or "").lower())
        if not expected:
            return False
        return descriptor.family in expected
```

- [ ] **Step 4: 让 SchemaSyncService 复用策略**

Modify imports in `app/application/semantic/schema_sync_service.py`:

```python
from app.application.semantic.field_candidates import TypeCompatibilityPolicy
```

Remove `_CUBE_TYPE_MAP` and `_normalize_physical_type`. Add a default policy in `SchemaSyncService.__init__`:

```python
        self._type_policy = TypeCompatibilityPolicy()
```

Replace the dimension type check block with:

```python
                        if not self._type_policy.is_compatible(raw_physical_type, dim.type):
                            report.drifts.append(DriftItem(
                                cube=cube.name,
                                table=cube.table,
                                kind="type_mismatch",
                                column=col,
                                detail=f"Dimension '{dim_name}' type='{dim.type}' but physical is '{raw_physical_type}'",
                            ))
```

Update `app/application/semantic/__init__.py`:

```python
from .field_candidates import PhysicalTypeDescriptor, PhysicalTypeMapper, TypeCompatibilityPolicy
```

Append to `__all__`:

```python
    "PhysicalTypeDescriptor",
    "PhysicalTypeMapper",
    "TypeCompatibilityPolicy",
```

- [ ] **Step 5: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/field_candidates/test_types.py \
  tests/unit/application/semantic/test_schema_sync.py \
  -q
```

Expected:

```text
... passed
```

- [ ] **Step 6: Commit**

```bash
git add \
  app/application/semantic/__init__.py \
  app/application/semantic/field_candidates/__init__.py \
  app/application/semantic/field_candidates/types.py \
  app/application/semantic/schema_sync_service.py \
  tests/unit/application/semantic/field_candidates/test_types.py \
  tests/unit/application/semantic/test_schema_sync.py
git commit -m "feat: add semantic field type compatibility policy"
```

### Task 2: 字段角色分类与指标语义推断

**Files:**
- Create: `app/application/semantic/field_candidates/classifier.py`
- Create: `tests/unit/application/semantic/field_candidates/test_classifier.py`
- Modify: `app/application/semantic/field_candidates/__init__.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/application/semantic/field_candidates/test_classifier.py`:

```python
from app.application.semantic.field_candidates.classifier import (
    MeasureSemanticsInferer,
    SemanticFieldClassifier,
)
from app.application.semantic.field_candidates.types import PhysicalTypeMapper


def test_classifier_marks_percentile_and_rate_as_non_additive_measures():
    mapper = PhysicalTypeMapper()
    classifier = SemanticFieldClassifier(mapper=mapper)
    inferer = MeasureSemanticsInferer()

    p75 = classifier.classify_field({"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"})
    rate = classifier.classify_field({"name": "completion_rate", "type": "DOUBLE", "comment": "完成率"})

    assert p75.selected_role == "measure.non_additive"
    assert p75.semantic_type == "number"
    assert p75.risk_level == "high"
    assert "non_additive_unconfirmed" in p75.issue_codes
    assert inferer.infer("p75_difficulty", "P75难度").aggregation == "avg"

    assert rate.selected_role == "measure.non_additive"
    assert "ratio_sum_risk" not in rate.issue_codes


def test_classifier_keeps_numeric_ids_and_levels_as_dimensions():
    classifier = SemanticFieldClassifier()

    student_id = classifier.classify_field({"name": "student_id", "type": "BIGINT", "comment": "学生ID"})
    grade_level = classifier.classify_field({"name": "grade_level", "type": "INT", "comment": "年级等级"})

    assert student_id.selected_role == "dimension.identifier"
    assert student_id.semantic_type == "number"
    assert grade_level.selected_role == "dimension.numeric"
    assert grade_level.risk_level in {"low", "medium"}


def test_classifier_marks_unknown_types_as_blocking_unknown():
    classifier = SemanticFieldClassifier()

    candidate = classifier.classify_field({"name": "payload", "type": "BINARY", "comment": "原始载荷"})

    assert candidate.selected_role == "unknown"
    assert candidate.risk_level == "high"
    assert "field_type_unknown" in candidate.issue_codes
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/field_candidates/test_classifier.py -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.application.semantic.field_candidates.classifier'
```

- [ ] **Step 3: 扩展类型文件的数据结构**

Append to `app/application/semantic/field_candidates/types.py`:

```python
from dataclasses import field
from typing import Any, Dict, List


@dataclass(frozen=True)
class MeasureSemantics:
    aggregation: str
    additivity: str
    default_format: str = "decimal"
    unit: Optional[str] = None
    is_ratio: bool = False
    recommended_name: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class FieldRoleCandidate:
    role: str
    confidence: float
    reasons: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class FieldCandidate:
    field: str
    physical_type: PhysicalTypeDescriptor
    semantic_type: str
    role_candidates: List[FieldRoleCandidate]
    selected_role: str
    measure_semantics: Optional[MeasureSemantics] = None
    warnings: List[str] = field(default_factory=list)
    issue_codes: List[str] = field(default_factory=list)
    risk_level: str = "low"
    decision: str = "auto_suggested"
    source: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field": self.field,
            "physical_type": {
                "raw_type": self.physical_type.raw_type,
                "normalized_type": self.physical_type.normalized_type,
                "family": self.physical_type.family,
                "precision": self.physical_type.precision,
                "scale": self.physical_type.scale,
            },
            "semantic_type": self.semantic_type,
            "role_candidates": [
                {"role": item.role, "confidence": item.confidence, "reasons": item.reasons}
                for item in self.role_candidates
            ],
            "selected_role": self.selected_role,
            "measure_semantics": None if self.measure_semantics is None else {
                "aggregation": self.measure_semantics.aggregation,
                "additivity": self.measure_semantics.additivity,
                "default_format": self.measure_semantics.default_format,
                "unit": self.measure_semantics.unit,
                "is_ratio": self.measure_semantics.is_ratio,
                "recommended_name": self.measure_semantics.recommended_name,
                "warnings": self.measure_semantics.warnings,
            },
            "warnings": self.warnings,
            "issue_codes": self.issue_codes,
            "risk_level": self.risk_level,
            "decision": self.decision,
            "source": self.source,
        }
```

- [ ] **Step 4: 新增分类器实现**

Create `app/application/semantic/field_candidates/classifier.py`:

```python
"""字段角色分类与指标语义推断。"""
from __future__ import annotations

import re
from typing import Any, Dict

from .types import (
    FieldCandidate,
    FieldRoleCandidate,
    MeasureSemantics,
    PhysicalTypeMapper,
)


class MeasureSemanticsInferer:
    """根据字段名和注释推断指标聚合与可加性。"""

    def infer(self, field_name: str, comment: str = "") -> MeasureSemantics:
        lower_name = field_name.lower()
        text = f"{lower_name} {comment}"
        if lower_name.startswith("max_") or lower_name.endswith("_max"):
            return MeasureSemantics("max", "non_additive", recommended_name=field_name)
        if lower_name.startswith("min_") or lower_name.endswith("_min"):
            return MeasureSemantics("min", "non_additive", recommended_name=field_name)
        if self._is_non_additive(text):
            return MeasureSemantics(
                "avg",
                "non_additive",
                is_ratio=any(token in text for token in ("rate", "ratio", "pct", "percent", "率", "比例")),
                recommended_name=self._measure_name("avg", field_name),
                warnings=["非可加指标需要确认跨粒度聚合口径"],
            )
        return MeasureSemantics("sum", "additive", recommended_name=self._measure_name("sum", field_name))

    @staticmethod
    def _is_non_additive(text: str) -> bool:
        return bool(
            re.search(r"(^|_)p\d{1,3}(_|$)", text)
            or any(token in text for token in (
                "_rate", "_ratio", "_pct", "_percent", "_avg", "_mean", "_median",
                "_stddev", "_variance", "_wow", "_mom", "_yoy",
                "avg_", "mean_", "median_", "stddev_", "variance_",
                "比率", "比例", "百分比", "均值", "平均", "分位", "中位数", "标准差", "方差", "环比", "同比",
            ))
        )

    @staticmethod
    def _measure_name(prefix: str, field_name: str) -> str:
        lower_name = field_name.lower()
        if lower_name.startswith(f"{prefix}_") or lower_name.endswith(f"_{prefix}"):
            return field_name
        return f"{prefix}_{field_name}"


class SemanticFieldClassifier:
    """把字段证据分类为维度、指标、技术字段或未知字段。"""

    _ID_SUFFIXES = ("_id", "_key", "_code", "_no")
    _NUMERIC_DIM_SUFFIXES = ("_level", "_grade", "_rank", "_status", "_type", "_class", "_category")
    _BOOLEAN_PREFIXES = ("is_", "has_", "can_", "should_", "allow_", "enable_")
    _TECHNICAL_FIELDS = {"ds", "dt", "pt", "__lifecycle__"}
    _MEASURE_SUFFIXES = (
        "_cnt", "_count", "_sum", "_total", "_amt", "_amount", "_num", "_number",
        "_price", "_rate", "_ratio", "_pct", "_percent", "_quantity", "_qty",
        "_value", "_score", "_duration", "_cost", "_fee", "_balance", "_avg",
        "_mean", "_median", "_stddev", "_variance", "_wow", "_mom", "_yoy",
    )
    _MEASURE_PREFIXES = ("avg_", "mean_", "median_", "stddev_", "std_", "variance_", "max_", "min_")

    def __init__(
        self,
        mapper: PhysicalTypeMapper | None = None,
        measure_inferer: MeasureSemanticsInferer | None = None,
    ):
        self._mapper = mapper or PhysicalTypeMapper()
        self._measure_inferer = measure_inferer or MeasureSemanticsInferer()

    def classify_field(self, column: Dict[str, Any]) -> FieldCandidate:
        field_name = str(column.get("name") or column.get("field_name") or column.get("physical_name") or "").strip()
        comment = str(column.get("comment") or column.get("description") or column.get("display_name") or "").strip()
        descriptor = self._mapper.parse(str(column.get("type") or column.get("data_type") or ""))
        lower_name = field_name.lower()
        source = dict(column.get("source") or {})

        if not field_name:
            return self._candidate(field_name, descriptor, "unknown", "unknown", 0.0, ["字段名为空"], ["field_name_missing"], "high", source)
        if descriptor.family == "unknown":
            return self._candidate(field_name, descriptor, "unknown", "unknown", 0.0, ["物理类型无法识别"], ["field_type_unknown"], "high", source)
        if lower_name in self._TECHNICAL_FIELDS or column.get("is_partition"):
            return self._candidate(field_name, descriptor, descriptor.family, "technical.partition", 0.95, ["分区或技术字段"], [], "low", source)
        if lower_name == "id" or any(lower_name.endswith(suffix) for suffix in self._ID_SUFFIXES):
            return self._candidate(field_name, descriptor, descriptor.family, "dimension.identifier", 0.92, ["字段名是 ID / Key / Code"], [], "low", source)
        if descriptor.family == "time":
            return self._candidate(field_name, descriptor, "time", "dimension.time", 0.94, ["物理类型为时间"], [], "low", source)
        if lower_name.endswith("_at") or lower_name in {"date", "time"}:
            return self._candidate(field_name, descriptor, "time", "dimension.time", 0.88, ["字段名像时间字段"], [], "medium", source)
        if descriptor.family == "boolean" or any(lower_name.startswith(prefix) for prefix in self._BOOLEAN_PREFIXES):
            return self._candidate(field_name, descriptor, "boolean", "dimension.categorical", 0.9, ["布尔或标记字段"], [], "low", source)
        if descriptor.family == "number" and self._is_measure_name(lower_name, comment):
            semantics = self._measure_inferer.infer(field_name, comment)
            issues = ["non_additive_unconfirmed"] if semantics.additivity != "additive" else []
            return self._candidate(
                field_name,
                descriptor,
                "number",
                f"measure.{semantics.additivity}",
                0.86,
                ["字段名或注释命中可度量语义"],
                issues,
                "high" if issues else "low",
                source,
                measure_semantics=semantics,
            )
        if descriptor.family == "number" and any(lower_name.endswith(suffix) for suffix in self._NUMERIC_DIM_SUFFIXES):
            return self._candidate(field_name, descriptor, "number", "dimension.numeric", 0.82, ["数值枚举或等级字段"], [], "medium", source)
        return self._candidate(field_name, descriptor, descriptor.family, "dimension.categorical", 0.72, ["默认作为可分组维度"], [], "low", source)

    def _candidate(
        self,
        field_name: str,
        descriptor,
        semantic_type: str,
        role: str,
        confidence: float,
        reasons: list[str],
        issue_codes: list[str],
        risk_level: str,
        source: Dict[str, Any],
        *,
        measure_semantics: MeasureSemantics | None = None,
    ) -> FieldCandidate:
        warnings = []
        if "non_additive_unconfirmed" in issue_codes:
            warnings.append("非可加指标需要确认聚合口径")
        if "field_type_unknown" in issue_codes:
            warnings.append("字段类型无法映射到平台语义类型")
        return FieldCandidate(
            field=field_name,
            physical_type=descriptor,
            semantic_type=semantic_type,
            role_candidates=[FieldRoleCandidate(role=role, confidence=confidence, reasons=reasons)],
            selected_role=role,
            measure_semantics=measure_semantics,
            warnings=warnings,
            issue_codes=issue_codes,
            risk_level=risk_level,
            source=source,
        )

    def _is_measure_name(self, lower_name: str, comment: str) -> bool:
        if any(lower_name.endswith(suffix) for suffix in self._MEASURE_SUFFIXES):
            return True
        if any(lower_name.startswith(prefix) for prefix in self._MEASURE_PREFIXES):
            return True
        if re.match(r"^p\d{1,3}(_|$)", lower_name) or re.search(r"_p\d{1,3}(_|$)", lower_name):
            return True
        return any(keyword in comment for keyword in ("金额", "数量", "比例", "百分比", "次数", "平均", "均值", "难度", "分位"))
```

Update `app/application/semantic/field_candidates/__init__.py`:

```python
from .classifier import MeasureSemanticsInferer, SemanticFieldClassifier
from .types import (
    FieldCandidate,
    FieldRoleCandidate,
    MeasureSemantics,
    PhysicalTypeDescriptor,
    PhysicalTypeMapper,
    TypeCompatibilityPolicy,
)

__all__ = [
    "FieldCandidate",
    "FieldRoleCandidate",
    "MeasureSemantics",
    "MeasureSemanticsInferer",
    "PhysicalTypeDescriptor",
    "PhysicalTypeMapper",
    "SemanticFieldClassifier",
    "TypeCompatibilityPolicy",
]
```

- [ ] **Step 5: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/field_candidates/test_classifier.py -q
```

Expected:

```text
3 passed
```

- [ ] **Step 6: Commit**

```bash
git add \
  app/application/semantic/field_candidates/__init__.py \
  app/application/semantic/field_candidates/classifier.py \
  app/application/semantic/field_candidates/types.py \
  tests/unit/application/semantic/field_candidates/test_classifier.py
git commit -m "feat: classify semantic field candidates"
```

### Task 3: FieldCandidateService 与候选集 trace

**Files:**
- Create: `app/application/semantic/field_candidates/service.py`
- Create: `tests/unit/application/semantic/field_candidates/test_service.py`
- Modify: `app/application/semantic/field_candidates/types.py`
- Modify: `app/application/semantic/field_candidates/__init__.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/application/semantic/field_candidates/test_service.py`:

```python
from app.application.semantic.field_candidates.service import FieldCandidateService


def test_preview_from_columns_returns_stable_candidate_set_with_summary():
    service = FieldCandidateService(ruleset_version="field-candidate-rules-test")
    columns = [
        {"name": "school_id", "type": "BIGINT", "comment": "学校ID"},
        {"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"},
        {"name": "dt", "type": "STRING", "is_partition": True},
    ]

    result = service.preview_from_columns(
        source={
            "source_kind": "asset",
            "source_ref": "maxcompute:df.ads_bi_question_base_stats_df",
            "evidence_snapshot_id": "snap_1",
        },
        columns=columns,
    )
    result_again = service.preview_from_columns(
        source={
            "source_kind": "asset",
            "source_ref": "maxcompute:df.ads_bi_question_base_stats_df",
            "evidence_snapshot_id": "snap_1",
        },
        columns=columns,
    )

    assert result.candidate_set_id == result_again.candidate_set_id
    assert result.summary["dimensions"] == 1
    assert result.summary["measures"] == 1
    assert result.summary["technical_fields"] == 1
    assert result.summary["warnings"] == 1
    assert result.to_dict()["fields"][1]["field"] == "p75_difficulty"


def test_preview_from_evidence_bundle_reads_schema_snapshot_fields():
    service = FieldCandidateService(ruleset_version="field-candidate-rules-test")
    evidence_bundle = {
        "schema_snapshot": {
            "fields": [
                {"field_name": "completion_rate", "data_type": "DOUBLE", "display_name": "完成率"},
            ]
        }
    }

    result = service.preview_from_evidence_bundle(
        source_id=7,
        database="df",
        schema=None,
        table="ads_bi_question_base_stats_df",
        evidence_bundle=evidence_bundle,
    )

    assert result.source["source_kind"] == "asset_evidence"
    assert result.fields[0].field == "completion_rate"
    assert result.fields[0].selected_role == "measure.non_additive"
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/field_candidates/test_service.py -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.application.semantic.field_candidates.service'
```

- [ ] **Step 3: 增加候选集类型**

Append to `app/application/semantic/field_candidates/types.py`:

```python
@dataclass(frozen=True)
class FieldCandidateSet:
    candidate_set_id: str
    ruleset_version: str
    source: Dict[str, Any]
    fields: List[FieldCandidate]
    summary: Dict[str, int]
    trace: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "candidate_set_id": self.candidate_set_id,
            "ruleset_version": self.ruleset_version,
            "source": self.source,
            "summary": self.summary,
            "trace": self.trace,
            "fields": [field_candidate.to_dict() for field_candidate in self.fields],
        }
```

- [ ] **Step 4: 新增 service 实现**

Create `app/application/semantic/field_candidates/service.py`:

```python
"""字段候选集生成服务。"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from .classifier import SemanticFieldClassifier
from .types import FieldCandidate, FieldCandidateSet


class FieldCandidateService:
    """把字段证据转换为可审查的候选集。"""

    def __init__(
        self,
        *,
        classifier: Optional[SemanticFieldClassifier] = None,
        ruleset_version: str = "field-candidate-rules-v1",
    ):
        self._classifier = classifier or SemanticFieldClassifier()
        self._ruleset_version = ruleset_version

    def preview_from_columns(
        self,
        *,
        source: Dict[str, Any],
        columns: List[Dict[str, Any]],
        selected_overrides: Optional[Dict[str, Any]] = None,
    ) -> FieldCandidateSet:
        normalized_source = dict(source or {})
        normalized_source.setdefault("source_kind", "unknown")
        selected_overrides = selected_overrides or {}
        fields: List[FieldCandidate] = []
        for column in columns:
            enriched = dict(column)
            enriched["source"] = {
                "source_ref": normalized_source.get("source_ref"),
                "evidence_snapshot_id": normalized_source.get("evidence_snapshot_id"),
            }
            fields.append(self._classifier.classify_field(enriched))
        summary = self._summary(fields)
        seed = {
            "source": normalized_source,
            "columns": columns,
            "ruleset_version": self._ruleset_version,
            "selected_overrides": selected_overrides,
        }
        candidate_set_id = "fcand_" + hashlib.sha1(
            json.dumps(seed, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        ).hexdigest()[:16]
        return FieldCandidateSet(
            candidate_set_id=candidate_set_id,
            ruleset_version=self._ruleset_version,
            source=normalized_source,
            fields=fields,
            summary=summary,
            trace={
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "override_scope": normalized_source.get("override_scope") or "session",
            },
        )

    def preview_from_evidence_bundle(
        self,
        *,
        source_id: Any,
        database: Optional[str],
        schema: Optional[str],
        table: Optional[str],
        evidence_bundle: Dict[str, Any],
    ) -> FieldCandidateSet:
        schema_snapshot = evidence_bundle.get("schema_snapshot") if isinstance(evidence_bundle, dict) else None
        raw_columns = []
        if isinstance(schema_snapshot, dict):
            raw_columns = schema_snapshot.get("columns") or schema_snapshot.get("fields") or []
        columns = self._normalize_columns(raw_columns)
        return self.preview_from_columns(
            source={
                "source_kind": "asset_evidence",
                "source_id": source_id,
                "database": database,
                "schema": schema,
                "table": table,
                "source_ref": f"{source_id}:{database}.{table}",
                "evidence_snapshot_id": schema_snapshot.get("snapshot_id") if isinstance(schema_snapshot, dict) else None,
            },
            columns=columns,
        )

    @staticmethod
    def _normalize_columns(raw_columns: Any) -> List[Dict[str, Any]]:
        if not isinstance(raw_columns, list):
            return []
        columns: List[Dict[str, Any]] = []
        for item in raw_columns:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("field_name") or item.get("physical_name") or "").strip()
            if not name:
                continue
            columns.append({
                "name": name,
                "type": item.get("type") or item.get("data_type") or item.get("field_type") or "string",
                "comment": item.get("comment") or item.get("description") or item.get("display_name") or "",
                "is_partition": bool(item.get("is_partition") or item.get("partition")),
            })
        return columns

    @staticmethod
    def _summary(fields: List[FieldCandidate]) -> Dict[str, int]:
        return {
            "dimensions": sum(1 for item in fields if item.selected_role.startswith("dimension.")),
            "measures": sum(1 for item in fields if item.selected_role.startswith("measure.")),
            "time_fields": sum(1 for item in fields if item.selected_role == "dimension.time"),
            "technical_fields": sum(1 for item in fields if item.selected_role.startswith("technical.")),
            "unknown": sum(1 for item in fields if item.selected_role == "unknown"),
            "warnings": sum(len(item.warnings) for item in fields),
            "high_risk": sum(1 for item in fields if item.risk_level == "high"),
        }
```

Update `app/application/semantic/field_candidates/__init__.py`:

```python
from .service import FieldCandidateService
from .types import FieldCandidateSet
```

Append to `__all__`:

```python
    "FieldCandidateService",
    "FieldCandidateSet",
```

- [ ] **Step 5: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/field_candidates -q
```

Expected:

```text
... passed
```

- [ ] **Step 6: Commit**

```bash
git add \
  app/application/semantic/field_candidates/__init__.py \
  app/application/semantic/field_candidates/service.py \
  app/application/semantic/field_candidates/types.py \
  tests/unit/application/semantic/field_candidates/test_service.py
git commit -m "feat: build semantic field candidate sets"
```

### Task 4: Cube 草案从候选集生成，旧 columns 入口变成内部 facade

**Files:**
- Modify: `app/application/semantic/cube_modeling_service.py`
- Modify: `tests/unit/application/semantic/test_cube_modeling_service.py`

- [ ] **Step 1: 写失败测试**

Append to `tests/unit/application/semantic/test_cube_modeling_service.py`:

```python
def test_build_cube_payload_uses_candidate_set_trace_and_roles():
    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(),
    )

    draft = service.build_cube_draft_payload(
        source_id=11,
        database="warehouse_prod",
        schema=None,
        table="question_stats",
        columns=[
            {"name": "question_id", "type": "BIGINT", "comment": "题目ID"},
            {"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"},
            {"name": "completion_rate", "type": "DOUBLE", "comment": "完成率"},
        ],
        name="question_stats",
    )

    assert "p75_difficulty" not in draft["dimensions"]
    assert "completion_rate" not in draft["dimensions"]
    assert draft["measures"]["avg_p75_difficulty"]["type"] == "avg"
    assert draft["measures"]["avg_completion_rate"]["non_additive"] is True
    assert draft["field_candidate_trace"]["draft_source_mode"] == "candidate_facade"
    assert draft["field_candidate_trace"]["candidate_set_id"].startswith("fcand_")
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_cube_modeling_service.py::test_build_cube_payload_uses_candidate_set_trace_and_roles \
  -q
```

Expected:

```text
KeyError: 'field_candidate_trace'
```

- [ ] **Step 3: 修改 CubeModelingService 构造函数**

Modify imports:

```python
from app.application.semantic.field_candidates import FieldCandidateService, FieldCandidateSet
```

Change `__init__` signature:

```python
        field_candidate_service: Optional[FieldCandidateService] = None,
```

Set instance:

```python
        self._field_candidate_service = field_candidate_service or FieldCandidateService()
```

- [ ] **Step 4: 新增 candidate set 草案生成方法**

Add method to `CubeModelingService`:

```python
    def build_cube_draft_from_candidate_set(
        self,
        *,
        candidate_set: FieldCandidateSet,
        source_id: int,
        database: Optional[str],
        schema: Optional[str],
        table: str,
        partitions: Optional[List[Any]] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        comment: Optional[str] = None,
        data_source: str = "maxcompute",
        source_sql: Optional[str] = None,
        source_dataset_id: Optional[int] = None,
        source_dataset_type: Optional[str] = None,
        draft_source_mode: str = "candidate_set",
    ) -> Dict[str, Any]:
        cube_name = self._normalize_name(name or table)
        cube_title = title or self._humanize_name(table)
        dimensions = self._build_dimensions_from_candidates(candidate_set)
        measures = self._build_measures_from_candidates(candidate_set, dimensions)
        if not measures and dimensions:
            first_dim = next(iter(dimensions.keys()))
            measures["total_count"] = MeasureDef(
                title="总数",
                type="count",
                sql=f"COUNT(`{first_dim}`)",
                description="自动生成的记录总数指标",
                source_data_type="count",
                certified=True,
            )
        payload = {
            "name": cube_name,
            "title": cube_title,
            "description": description or comment or f"基于 {table} 自动生成的 Cube 草稿",
            "table": table,
            "source_id": int(source_id),
            "source_database": database,
            "source_schema": schema,
            "data_source": data_source,
            "status": "draft",
            "dimensions": dimensions,
            "measures": {key: measure.model_dump(exclude_none=True) for key, measure in measures.items()},
            "segments": {},
            "joins": {},
            "field_candidate_trace": {
                "candidate_set_id": candidate_set.candidate_set_id,
                "ruleset_version": candidate_set.ruleset_version,
                "summary": candidate_set.summary,
                "source": candidate_set.source,
                "draft_source_mode": draft_source_mode,
            },
        }
        if source_sql:
            payload["source_sql"] = source_sql
        if source_dataset_id is not None:
            payload["source_dataset_id"] = int(source_dataset_id)
        if source_dataset_type:
            payload["source_dataset_type"] = source_dataset_type
        normalized_partitions = partitions or []
        if normalized_partitions:
            first_partition = normalized_partitions[0]
            part_field = str(first_partition.get("name") if isinstance(first_partition, dict) else first_partition)
            payload["partition"] = {
                "field": part_field,
                "type": "date" if self._infer_dimension_type(part_field, "string") == "time" else "string",
                "format": "yyyyMMdd" if "ds" in part_field.lower() else "yyyy-MM-dd",
                "max_range_days": 90,
            }
        primary_key = next((field_name for field_name, dim in dimensions.items() if dim.get("primary_key")), None)
        if primary_key:
            payload["entity_key"] = primary_key
            payload["grain"] = primary_key
        return payload
```

- [ ] **Step 5: 新增候选到维度/指标转换方法**

Add helper methods:

```python
    def _build_dimensions_from_candidates(self, candidate_set: FieldCandidateSet) -> Dict[str, Dict[str, Any]]:
        dimensions: Dict[str, Dict[str, Any]] = {}
        for candidate in candidate_set.fields:
            if not candidate.selected_role.startswith("dimension."):
                continue
            field_name = candidate.field
            lower_name = field_name.lower()
            dimensions[field_name] = {
                "title": self._humanize_name(field_name),
                "type": candidate.semantic_type if candidate.semantic_type in {"string", "number", "time", "boolean"} else "string",
                "sql": f"`{field_name}`",
                "description": "; ".join(candidate.warnings) or None,
                "source_data_type": candidate.physical_type.raw_type,
                "primary_key": candidate.selected_role == "dimension.identifier" or lower_name in {"id", "pk"} or lower_name.endswith("_id"),
            }
        return dimensions

    def _build_measures_from_candidates(
        self,
        candidate_set: FieldCandidateSet,
        dimensions: Dict[str, Dict[str, Any]],
    ) -> Dict[str, MeasureDef]:
        measures: Dict[str, MeasureDef] = {}
        count_basis = next(
            (name for name, dim in dimensions.items() if dim.get("primary_key")),
            next(iter(dimensions.keys()), "id"),
        )
        measures["total_count"] = MeasureDef(
            title="总数",
            type="count",
            sql=f"COUNT(`{count_basis}`)",
            description="自动生成的记录总数指标",
            source_data_type="count",
            certified=True,
        )
        for candidate in candidate_set.fields:
            if not candidate.selected_role.startswith("measure.") or candidate.measure_semantics is None:
                continue
            semantics = candidate.measure_semantics
            measure_name = semantics.recommended_name or self._build_measure_name(semantics.aggregation, candidate.field)
            measures[measure_name] = MeasureDef(
                title=self._humanize_name(candidate.field),
                type=semantics.aggregation,
                sql=f"{semantics.aggregation.upper()}(`{candidate.field}`)",
                description=f"基于字段候选生成的 {candidate.field} {semantics.aggregation} 指标",
                source_data_type=candidate.physical_type.raw_type,
                non_additive=semantics.additivity != "additive",
            )
        return measures
```

- [ ] **Step 6: 改造 build_cube_draft_payload 内部入口**

At the start of `build_cube_draft_payload`, replace direct `dimensions = ...` / `measures = ...` generation with:

```python
        candidate_set = self._field_candidate_service.preview_from_columns(
            source={
                "source_kind": "raw_columns_facade",
                "source_ref": f"{source_id}:{database}.{table}",
                "database": database,
                "schema": schema,
                "table": table,
            },
            columns=columns,
        )
        return self.build_cube_draft_from_candidate_set(
            candidate_set=candidate_set,
            source_id=source_id,
            database=database,
            schema=schema,
            table=table,
            partitions=partitions,
            name=name,
            title=title,
            description=description,
            comment=comment,
            data_source=data_source,
            source_sql=source_sql,
            source_dataset_id=source_dataset_id,
            source_dataset_type=source_dataset_type,
            draft_source_mode="candidate_facade",
        )
```

Leave `_build_dimensions`, `_build_measures`, `_is_likely_measure`, `_infer_measure_aggregation` in place for one commit only if removing them creates a large diff; Task 5 will remove unused methods after source service tests pass.

- [ ] **Step 7: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_cube_modeling_service.py \
  tests/unit/application/semantic/field_candidates \
  -q
```

Expected:

```text
... passed
```

- [ ] **Step 8: Commit**

```bash
git add \
  app/application/semantic/cube_modeling_service.py \
  tests/unit/application/semantic/test_cube_modeling_service.py
git commit -m "feat: generate cube drafts from field candidates"
```

### Task 5: Source Service、Copilot Draft Builder 与 DI 接入候选层

**Files:**
- Modify: `app/application/semantic/cube_modeling_source_service.py`
- Modify: `app/application/semantic/modeling_draft_builder.py`
- Modify: `app/di/container.py`
- Modify: `tests/unit/application/semantic/test_cube_modeling_source_service.py`
- Modify: `tests/unit/application/semantic/test_modeling_draft_builder.py`

- [ ] **Step 1: 写失败测试**

Append to `tests/unit/application/semantic/test_cube_modeling_source_service.py`:

```python
def test_asset_evidence_generates_candidate_trace_before_cube_draft():
    cube_modeling_service = MagicMock()
    cube_modeling_service.build_cube_draft_from_candidate_set.return_value = {
        "name": "question_stats",
        "status": "draft",
        "field_candidate_trace": {"candidate_set_id": "fcand_test"},
    }
    service = _source_service(cube_modeling_service)

    result = service.generate_cube_draft_from_asset_evidence(
        source_id=7,
        database="df",
        schema=None,
        table="ads_bi_question_base_stats_df",
        evidence_bundle={
            "schema_snapshot": {
                "snapshot_id": "snap_1",
                "columns": [
                    {"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"},
                ],
            }
        },
    )

    assert result["field_candidate_trace"]["candidate_set_id"] == "fcand_test"
    cube_modeling_service.build_cube_draft_payload.assert_not_called()
    cube_modeling_service.build_cube_draft_from_candidate_set.assert_called_once()
```

Append to `tests/unit/application/semantic/test_modeling_draft_builder.py`:

```python
def test_spec_draft_preserves_field_candidate_trace_from_cube_draft():
    source_service = MagicMock()
    cube = _cube_draft()
    cube["field_candidate_trace"] = {
        "candidate_set_id": "fcand_review",
        "ruleset_version": "field-candidate-rules-v1",
        "summary": {"measures": 1, "warnings": 1},
    }
    source_service.generate_cube_draft_from_source.return_value = cube
    builder = _builder(source_service=source_service)

    result = builder.create_spec_draft(
        {"source_kind": "physical_table", "source_id": 7, "database": "dw", "table": "question_stats", "business_subject": "题目统计"}
    )

    assert result["spec"]["cube"]["field_candidate_trace"]["candidate_set_id"] == "fcand_review"
    assert result["spec"]["governance"]["field_candidate_summary"]["warnings"] == 1
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_cube_modeling_source_service.py::test_asset_evidence_generates_candidate_trace_before_cube_draft \
  tests/unit/application/semantic/test_modeling_draft_builder.py::test_spec_draft_preserves_field_candidate_trace_from_cube_draft \
  -q
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: 改造 CubeModelingSourceService**

Modify `generate_cube_draft_from_asset_evidence` after columns / partitions are normalized:

```python
        candidate_set = self._cube_modeling_service._field_candidate_service.preview_from_evidence_bundle(
            source_id=source_id_for_payload,
            database=database,
            schema=schema,
            table=table,
            evidence_bundle=evidence_bundle,
        )
        payload = self._cube_modeling_service.build_cube_draft_from_candidate_set(
            candidate_set=candidate_set,
            source_id=source_id_for_payload,
            database=database,
            schema=schema,
            table=table,
            partitions=partitions,
            name=name or table,
            title=title or schema_snapshot.get("title"),
            description=description or schema_snapshot.get("description"),
            comment=schema_snapshot.get("comment"),
            data_source="metadata_snapshot",
            draft_source_mode="asset_evidence",
        )
```

Modify `_generate_from_virtual_dataset` by replacing `build_cube_draft_payload(...)` with candidate flow:

```python
        candidate_set = self._cube_modeling_service._field_candidate_service.preview_from_columns(
            source={
                "source_kind": "dataset_virtual",
                "source_ref": f"dataset:{dataset.id}",
                "dataset_id": int(dataset.id),
                "database": source_database,
                "table": dataset.dataset_code,
            },
            columns=columns,
        )
        payload = self._cube_modeling_service.build_cube_draft_from_candidate_set(
            candidate_set=candidate_set,
            source_id=int(dataset.source_id),
            database=source_database,
            schema=None,
            table=dataset.dataset_code,
            partitions=[
                field.physical_name
                for field in field_items
                if field.business_type in {"partition", "partition_key"}
            ],
            name=name or dataset.dataset_code,
            title=title or dataset.dataset_name,
            description=description or dataset.description,
            comment=dataset.description or f"基于虚拟数据集 {dataset.dataset_name} 自动生成的 Cube 草稿",
            source_sql=dataset.sql_query,
            source_dataset_id=int(dataset.id),
            source_dataset_type=dataset.dataset_type,
            draft_source_mode="dataset_virtual",
        )
```

- [ ] **Step 4: ModelingDraftBuilder 写入治理摘要**

In `SemanticModelDraftBuilder.create_spec_draft`, after `sensitive_fields = ...`, add:

```python
        field_candidate_trace = cube.get("field_candidate_trace") or {}
```

Inside `"governance"` dict add:

```python
                "field_candidate_summary": field_candidate_trace.get("summary") or {},
                "field_candidate_trace": field_candidate_trace,
```

- [ ] **Step 5: DI 注册共享 FieldCandidateService**

In `app/di/container.py`, import:

```python
from app.application.semantic.field_candidates import FieldCandidateService
```

Add provider before `cube_modeling_service`:

```python
    semantic_field_candidate_service = providers.Singleton(
        FieldCandidateService,
    )
```

Pass into `CubeModelingService`:

```python
        field_candidate_service=semantic_field_candidate_service,
```

- [ ] **Step 6: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_cube_modeling_source_service.py \
  tests/unit/application/semantic/test_modeling_draft_builder.py \
  -q
```

Expected:

```text
... passed
```

- [ ] **Step 7: Commit**

```bash
git add \
  app/application/semantic/cube_modeling_source_service.py \
  app/application/semantic/modeling_draft_builder.py \
  app/di/container.py \
  tests/unit/application/semantic/test_cube_modeling_source_service.py \
  tests/unit/application/semantic/test_modeling_draft_builder.py
git commit -m "feat: route modeling sources through field candidates"
```

### Task 6: API 契约与兼容 facade

**Files:**
- Modify: `app/interfaces/api/v1/semantic.py`
- Modify: `tests/integration/test_semantic_api.py`
- Create: `tests/integration/semantic/test_field_candidate_api.py`

- [ ] **Step 1: 写失败测试**

Create `tests/integration/semantic/test_field_candidate_api.py`:

```python
from flask import Flask
from unittest.mock import MagicMock

from app.interfaces.api.v1.semantic import create_semantic_blueprint
from app.shared.exceptions import register_error_handlers
from tests.conftest import install_default_admin_auth


def _client(field_candidate_service, modeling_service=None, modeling_source_service=None):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(
        create_semantic_blueprint(
            semantic_service=MagicMock(),
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=MagicMock(),
            registry_repo=MagicMock(),
            modeling_service=modeling_service or MagicMock(),
            modeling_source_service=modeling_source_service or MagicMock(),
            field_candidate_service=field_candidate_service,
            domain_modeling_service=MagicMock(),
            domain_canvas_service=MagicMock(),
        )
    )
    register_error_handlers(app)
    return install_default_admin_auth(app.test_client())


def test_field_candidates_preview_endpoint_returns_candidate_set():
    field_candidate_service = MagicMock()
    field_candidate_service.preview_from_columns.return_value.to_dict.return_value = {
        "candidate_set_id": "fcand_api",
        "summary": {"measures": 1, "warnings": 1},
        "fields": [{"field": "p75_difficulty", "selected_role": "measure.non_additive"}],
    }
    client = _client(field_candidate_service)

    resp = client.post(
        "/api/v1/semantic/field-candidates/preview",
        json={
            "source": {"source_kind": "inline"},
            "columns": [{"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"}],
        },
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["candidate_set_id"] == "fcand_api"
    field_candidate_service.preview_from_columns.assert_called_once()


def test_draft_from_candidates_endpoint_accepts_inline_candidate_set():
    modeling_service = MagicMock()
    modeling_service.build_cube_draft_from_inline_candidate_payload.return_value = {
        "name": "question_stats",
        "status": "draft",
        "field_candidate_trace": {"candidate_set_id": "fcand_inline"},
    }
    client = _client(MagicMock(), modeling_service=modeling_service)

    resp = client.post(
        "/api/v1/semantic/cubes/draft-from-candidates",
        json={
            "candidate_set": {"candidate_set_id": "fcand_inline", "fields": []},
            "source_id": 7,
            "database": "df",
            "table": "question_stats",
        },
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["field_candidate_trace"]["candidate_set_id"] == "fcand_inline"
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/integration/semantic/test_field_candidate_api.py -q
```

Expected:

```text
TypeError: create_semantic_blueprint() got an unexpected keyword argument 'field_candidate_service'
```

- [ ] **Step 3: 修改 blueprint 签名与 fallback**

In `app/interfaces/api/v1/semantic.py`, add import:

```python
from app.application.semantic.field_candidates import FieldCandidateService
```

Add parameter to `create_semantic_blueprint`:

```python
    field_candidate_service: FieldCandidateService | None = None,
```

Inside function setup, create fallback:

```python
    field_candidate_service = field_candidate_service or FieldCandidateService()
```

- [ ] **Step 4: 新增 preview endpoint**

Add route before cube routes:

```python
    @bp.route('/field-candidates/preview', methods=['POST'])
    @require_admin
    def preview_field_candidates():
        body = request.get_json(silent=True) or {}
        columns = body.get("columns") or []
        source = body.get("source") or {}
        if not isinstance(columns, list):
            return error("请求体 columns 必须是数组")
        try:
            result = field_candidate_service.preview_from_columns(
                source=source,
                columns=columns,
                selected_overrides=body.get("selected_overrides") or {},
            )
        except Exception as exc:
            return error(f"生成字段候选失败: {str(exc)}")
        return success(data=result.to_dict())
```

- [ ] **Step 5: 新增 draft-from-candidates endpoint**

Add route:

```python
    @bp.route('/cubes/draft-from-candidates', methods=['POST'])
    @require_admin
    def draft_cube_from_candidates():
        body = request.get_json(silent=True) or {}
        try:
            result = modeling_service.build_cube_draft_from_inline_candidate_payload(body)
        except AttributeError:
            return error("当前 modeling_service 不支持 draft-from-candidates")
        except Exception as exc:
            return error(f"基于字段候选生成 Cube 草稿失败: {str(exc)}")
        return success(data=result)
```

In Task 4, add `build_cube_draft_from_inline_candidate_payload` to `CubeModelingService`:

```python
    def build_cube_draft_from_inline_candidate_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        candidate_set_payload = payload.get("candidate_set") or {}
        candidate_set = self._field_candidate_service.preview_from_columns(
            source=candidate_set_payload.get("source") or {"source_kind": "inline_candidate"},
            columns=[
                {
                    "name": item.get("field"),
                    "type": (item.get("physical_type") or {}).get("raw_type") or "string",
                    "comment": item.get("title") or "",
                }
                for item in candidate_set_payload.get("fields") or []
            ],
        )
        return self.build_cube_draft_from_candidate_set(
            candidate_set=candidate_set,
            source_id=int(payload.get("source_id") or 1),
            database=payload.get("database"),
            schema=payload.get("schema"),
            table=payload.get("table") or "candidate_table",
            name=payload.get("name"),
            title=payload.get("title"),
            description=payload.get("description"),
            draft_source_mode="inline_candidate",
        )
```

- [ ] **Step 6: 旧入口 trace 兼容测试**

Modify `tests/integration/test_semantic_api.py::TestCubesEndpoint.test_draft_cube_from_source_returns_200`:

```python
        assert data["field_candidate_trace"]["draft_source_mode"] == "compatibility_facade"
```

Set mock return in fixture or test:

```python
        mock_modeling_source_service.generate_cube_draft_from_source.return_value["field_candidate_trace"] = {
            "candidate_set_id": "fcand_compat",
            "draft_source_mode": "compatibility_facade",
        }
```

- [ ] **Step 7: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/integration/semantic/test_field_candidate_api.py \
  tests/integration/test_semantic_api.py::TestCubesEndpoint::test_draft_cube_from_source_returns_200 \
  -q
```

Expected:

```text
... passed
```

- [ ] **Step 8: Commit**

```bash
git add \
  app/interfaces/api/v1/semantic.py \
  app/application/semantic/cube_modeling_service.py \
  tests/integration/semantic/test_field_candidate_api.py \
  tests/integration/test_semantic_api.py
git commit -m "feat: expose field candidate modeling APIs"
```

### Task 7: 发布门禁候选 issue 与 Copilot Review 暴露

**Files:**
- Modify: `app/application/semantic/modeling_draft_builder.py`
- Modify: `tests/unit/application/semantic/test_modeling_draft_builder.py`

- [ ] **Step 1: 写失败测试**

Append to `tests/unit/application/semantic/test_modeling_draft_builder.py`:

```python
def test_validate_blocks_high_risk_field_candidate_issues():
    builder = _builder()
    spec = _builder().create_spec_draft(
        {"source_kind": "physical_table", "source_id": 7, "database": "dw", "table": "question_stats", "business_subject": "题目统计"}
    )["spec"]
    spec["cube"]["field_candidate_trace"] = {
        "candidate_set_id": "fcand_block",
        "summary": {"warnings": 1},
        "issues": [
            {"code": "ratio_sum_risk", "field": "completion_rate", "severity": "error", "message": "比例字段不能使用 sum"},
        ],
    }

    result = builder.validate(spec)

    assert result["status"] == "blocked"
    assert any(issue["code"] == "ratio_sum_risk" for issue in result["issues"])
    assert result["checks"]["field_candidates"] == "failed"
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_modeling_draft_builder.py::test_validate_blocks_high_risk_field_candidate_issues \
  -q
```

Expected:

```text
KeyError: 'field_candidates'
```

- [ ] **Step 3: 增加候选 issue 归一化**

Add helper method to `SemanticModelDraftBuilder`:

```python
    def _field_candidate_issues(self, cube: Dict[str, Any]) -> List[Dict[str, Any]]:
        trace = cube.get("field_candidate_trace") or {}
        issues = trace.get("issues") or []
        normalized: List[Dict[str, Any]] = []
        blocking_codes = {
            "field_type_unknown",
            "metric_aggregation_missing",
            "non_additive_unconfirmed",
            "candidate_snapshot_stale",
            "dimension_metric_conflict",
            "ratio_sum_risk",
        }
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            code = str(issue.get("code") or "field_candidate_issue")
            severity = "error" if code in blocking_codes or issue.get("severity") == "error" else "warning"
            normalized.append(
                self._issue(
                    severity,
                    f"field_candidate.{issue.get('field') or code}",
                    str(issue.get("message") or f"字段候选问题: {code}"),
                    code=code,
                )
            )
        return normalized
```

If `_issue` currently has no `code` argument, change it to:

```python
    @staticmethod
    def _issue(severity: str, path: str, message: str, code: str = "validation_issue") -> Dict[str, Any]:
        return {"severity": severity, "path": path, "message": message, "code": code}
```

- [ ] **Step 4: validate 接入 field candidate checks**

In `validate`, after `cube = spec.get("cube") or {}`, add:

```python
        issues.extend(self._field_candidate_issues(cube))
```

In `checks`, add:

```python
                "field_candidates": "failed" if any(i["path"].startswith("field_candidate") and i["severity"] == "error" for i in issues) else "passed",
```

- [ ] **Step 5: 确认测试通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_draft_builder.py -q
```

Expected:

```text
... passed
```

- [ ] **Step 6: Commit**

```bash
git add \
  app/application/semantic/modeling_draft_builder.py \
  tests/unit/application/semantic/test_modeling_draft_builder.py
git commit -m "feat: block publish on high-risk field candidates"
```

### Task 8: 前端 API 类型、Cube 工作台文案和最小候选 Review

**Files:**
- Modify: `frontend/src/v2/api/semantic.ts`
- Modify: `frontend/src/v2/hooks/semantic.ts`
- Modify: `frontend/src/v2/pages/semantic/cubes/CubeCreate.tsx`
- Modify: `frontend/src/v2/pages/semantic/cubes/CubeCreate.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
- Create: `frontend/src/v2/api/semantic-field-candidates.test.ts`

- [ ] **Step 1: 写 API 类型测试**

Create `frontend/src/v2/api/semantic-field-candidates.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { draftCubeFromCandidates, previewFieldCandidates } from './semantic'
import { client } from './client'

vi.mock('./client', () => ({
  client: {
    post: vi.fn(),
  },
}))

describe('field candidate semantic api', () => {
  it('posts preview payload to field-candidates endpoint', async () => {
    vi.mocked(client.post).mockResolvedValueOnce({ candidate_set_id: 'fcand_ui', fields: [] })

    await previewFieldCandidates({
      source: { source_kind: 'inline' },
      columns: [{ name: 'p75_difficulty', type: 'DECIMAL(10,4)' }],
    })

    expect(client.post).toHaveBeenCalledWith('/semantic/field-candidates/preview', {
      source: { source_kind: 'inline' },
      columns: [{ name: 'p75_difficulty', type: 'DECIMAL(10,4)' }],
    })
  })

  it('posts inline candidate set to draft-from-candidates endpoint', async () => {
    vi.mocked(client.post).mockResolvedValueOnce({ name: 'question_stats', status: 'draft' })

    await draftCubeFromCandidates({
      candidate_set: { candidate_set_id: 'fcand_ui', fields: [] },
      source_id: 7,
      database: 'df',
      table: 'question_stats',
    })

    expect(client.post).toHaveBeenCalledWith('/semantic/cubes/draft-from-candidates', {
      candidate_set: { candidate_set_id: 'fcand_ui', fields: [] },
      source_id: 7,
      database: 'df',
      table: 'question_stats',
    })
  })
})
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
cd frontend && npm exec -- vitest run src/v2/api/semantic-field-candidates.test.ts --reporter=basic
```

Expected:

```text
No matching export in "src/v2/api/semantic.ts" for import "previewFieldCandidates"
```

- [ ] **Step 3: 增加 API 类型和函数**

In `frontend/src/v2/api/semantic.ts`, add:

```typescript
export interface SemanticFieldCandidate {
  field: string
  semantic_type: string
  selected_role: string
  risk_level: 'low' | 'medium' | 'high' | string
  warnings?: string[]
  issue_codes?: string[]
  measure_semantics?: {
    aggregation: string
    additivity: string
    recommended_name?: string | null
  } | null
}

export interface SemanticFieldCandidateSet {
  candidate_set_id: string
  ruleset_version?: string
  source?: Record<string, unknown>
  summary?: Record<string, number>
  fields: SemanticFieldCandidate[]
  trace?: Record<string, unknown>
}

export interface FieldCandidatePreviewBody {
  source: Record<string, unknown>
  columns: Array<{ name: string; type: string; comment?: string; is_partition?: boolean }>
  selected_overrides?: Record<string, unknown>
}

export interface CubeDraftFromCandidatesBody {
  candidate_set_id?: string
  candidate_set?: Partial<SemanticFieldCandidateSet> | null
  source_id?: string | number
  database?: string
  schema?: string
  table: string
  name?: string
  title?: string
  description?: string
}

export const previewFieldCandidates = (body: FieldCandidatePreviewBody) =>
  post<SemanticFieldCandidateSet>('/semantic/field-candidates/preview', body)

export const draftCubeFromCandidates = (body: CubeDraftFromCandidatesBody) =>
  post<CubeDetail>('/semantic/cubes/draft-from-candidates', body)
```

Update `CubeDraftBody.source_kind` to include compatibility wording:

```typescript
  source_kind: 'dataset' | 'physical_table' | 'datasource' | string
```

- [ ] **Step 4: 增加 hooks**

In `frontend/src/v2/hooks/semantic.ts`, import the new APIs:

```typescript
  draftCubeFromCandidates,
  previewFieldCandidates,
```

Add hooks:

```typescript
export function usePreviewFieldCandidates() {
  return useMutation({
    mutationFn: previewFieldCandidates,
  })
}

export function useDraftCubeFromCandidates() {
  return useMutation({
    mutationFn: draftCubeFromCandidates,
  })
}
```

- [ ] **Step 5: CubeCreate 文案去歧义**

In `frontend/src/v2/pages/semantic/cubes/CubeCreate.tsx`, change the file header comment:

```typescript
//   POST /api/v1/semantic/cubes/draft-from-source — 兼容入口，内部先生成字段候选再生成草稿
```

Change mode labels:

```typescript
{ id: 'from-dataset', icon: Database, label: t('cube.mode.fromDataset', '从数据集候选生成'), desc: t('cube.mode.fromDatasetDesc', '先生成字段候选并进行风险确认，再生成 Cube 草稿') },
{ id: 'from-datasource', icon: Database, label: t('cube.mode.fromDatasource', '从数据源候选生成'), desc: t('cube.mode.fromDatasourceDesc', '指定数据库 / 表，先生成字段候选，再生成 Cube 草稿') },
```

After successful draft response, before navigation, store trace in session storage:

```typescript
      if (result.field_candidate_trace) {
        window.sessionStorage.setItem(`cube-draft-field-candidates:${result.name}`, JSON.stringify(result.field_candidate_trace))
      }
```

- [ ] **Step 6: Modeling Copilot Review 展示候选摘要**

In `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`, find the Review / Trace artifact rendering area. Add a compact block where cube trace is available:

```tsx
function FieldCandidateTraceBlock({ trace }: { trace?: Record<string, any> }) {
  if (!trace || !trace.candidate_set_id) return null
  const summary = (trace.summary || {}) as Record<string, number>
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg-surface)] p-3">
      <div className="text-xs font-semibold text-1">字段候选 Review</div>
      <div className="mt-1 text-xs text-3">
        候选集 {String(trace.candidate_set_id)} · 指标 {summary.measures || 0} · 维度 {summary.dimensions || 0} · 风险 {summary.high_risk || 0}
      </div>
    </section>
  )
}
```

Render it near cube artifact summary:

```tsx
<FieldCandidateTraceBlock trace={(spec?.cube as any)?.field_candidate_trace || (review as any)?.field_candidate_trace} />
```

- [ ] **Step 7: 写前端页面测试**

Append to `frontend/src/v2/pages/semantic/cubes/CubeCreate.test.tsx`:

```typescript
it('uses field candidate wording for generated cube modes', async () => {
  render(<CubeCreate />)

  expect(await screen.findByText('从数据集候选生成')).toBeInTheDocument()
  expect(screen.getByText('先生成字段候选并进行风险确认，再生成 Cube 草稿')).toBeInTheDocument()
  expect(screen.getByText('从数据源候选生成')).toBeInTheDocument()
})
```

Append to `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx` with the local fixture that already renders `session_1`:

```typescript
it('在 Review 中展示字段候选摘要', async () => {
  renderAt('/semantic/modeling-copilot/session_1')

  expect(await screen.findByText('字段候选 Review')).toBeInTheDocument()
})
```

Ensure the `session_1` fixture includes:

```typescript
field_candidate_trace: {
  candidate_set_id: 'fcand_fixture',
  summary: { measures: 1, dimensions: 2, high_risk: 1 },
}
```

- [ ] **Step 8: 确认前端测试通过**

Run:

```bash
cd frontend && npm exec -- vitest run \
  src/v2/api/semantic-field-candidates.test.ts \
  src/v2/pages/semantic/cubes/CubeCreate.test.tsx \
  src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx \
  --reporter=basic
```

Expected:

```text
Test Files 3 passed
```

- [ ] **Step 9: Commit**

```bash
git add \
  frontend/src/v2/api/semantic.ts \
  frontend/src/v2/hooks/semantic.ts \
  frontend/src/v2/api/semantic-field-candidates.test.ts \
  frontend/src/v2/pages/semantic/cubes/CubeCreate.tsx \
  frontend/src/v2/pages/semantic/cubes/CubeCreate.test.tsx \
  frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx \
  frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
git commit -m "feat: surface field candidate review in semantic UI"
```

### Task 9: E2E、文档和交付验证

**Files:**
- Create: `frontend/tests/e2e-v2/p35-field-candidate-layer.spec.ts`
- Modify: `docs/architecture/semantic-field-candidate-layer.md`
- Modify: `docs/quality/testing.md`

- [ ] **Step 1: 写 E2E 测试**

Create `frontend/tests/e2e-v2/p35-field-candidate-layer.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'

test.describe('P35 field candidate layer', () => {
  test('cube creation presents candidate-based generation wording', async ({ page }) => {
    await page.goto('/semantic/cubes/new')

    await expect(page.getByText('从数据集候选生成')).toBeVisible()
    await expect(page.getByText('从数据源候选生成')).toBeVisible()
    await expect(page.getByText('先生成字段候选')).toBeVisible()
  })

  test('field candidate preview API returns non-additive measure suggestion', async ({ request }) => {
    const response = await request.post('/api/v1/semantic/field-candidates/preview', {
      data: {
        source: { source_kind: 'inline', source_ref: 'e2e:question_stats' },
        columns: [
          { name: 'question_id', type: 'BIGINT', comment: '题目ID' },
          { name: 'p75_difficulty', type: 'DECIMAL(10,4)', comment: 'P75难度' },
        ],
      },
    })

    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    const fields = body.data.fields
    const p75 = fields.find((item: any) => item.field === 'p75_difficulty')
    expect(p75.selected_role).toBe('measure.non_additive')
    expect(p75.issue_codes).toContain('non_additive_unconfirmed')
  })
})
```

- [ ] **Step 2: 确认 E2E 初次失败或跳过条件清晰**

Run with local stack:

```bash
cd frontend && npm run test:e2e:v2 -- p35-field-candidate-layer.spec.ts --workers=1
```

Expected before backend/frontend tasks are merged:

```text
failed because /api/v1/semantic/field-candidates/preview is not registered
```

Expected after tasks are merged:

```text
2 passed
```

- [ ] **Step 3: 更新架构文档状态**

In `docs/architecture/semantic-field-candidate-layer.md`, change frontmatter after implementation passes:

```yaml
status: current
source_of_truth: secondary
```

Add an “实施状态” section:

```markdown
## 17. 实施状态

- `PhysicalTypeMapper / TypeCompatibilityPolicy` 已成为 Schema drift 与候选层共享入口。
- `draft-from-source` 保留为 compatibility facade，trace 中必须包含字段候选证据。
- Candidate set 首期不落独立 SQL 表，只保存在 session artifact / Proposal evidence / draft trace 中。
- 正式 runtime 不读取候选层。
```

- [ ] **Step 4: 更新验证文档**

Append to `docs/quality/testing.md` semantic verification section:

```markdown
### 字段候选层专项验证

字段候选层改动至少执行：

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/field_candidates -q
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_cube_modeling_service.py tests/unit/application/semantic/test_cube_modeling_source_service.py tests/unit/application/semantic/test_modeling_draft_builder.py tests/unit/application/semantic/test_schema_sync.py -q
PYTHONPATH=. python -m pytest --no-cov tests/integration/semantic/test_field_candidate_api.py -q
cd frontend && npm exec -- vitest run src/v2/api/semantic-field-candidates.test.ts src/v2/pages/semantic/cubes/CubeCreate.test.tsx src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx --reporter=basic
```

涉及真实页面验收时增加：

```bash
cd frontend && npm run test:e2e:v2 -- p35-field-candidate-layer.spec.ts --workers=1
```
```

- [ ] **Step 5: 运行完整验证**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/field_candidates -q
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_cube_modeling_service.py \
  tests/unit/application/semantic/test_cube_modeling_source_service.py \
  tests/unit/application/semantic/test_modeling_draft_builder.py \
  tests/unit/application/semantic/test_schema_sync.py \
  -q
PYTHONPATH=. python -m pytest --no-cov tests/integration/semantic/test_field_candidate_api.py -q
cd frontend && npm exec -- vitest run \
  src/v2/api/semantic-field-candidates.test.ts \
  src/v2/pages/semantic/cubes/CubeCreate.test.tsx \
  src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx \
  --reporter=basic
make verify-docs
git diff --check
```

Expected:

```text
all selected pytest tests passed
Test Files 3 passed
[docs] 运行文档健康检查
结果：通过
git diff --check produced no output
```

- [ ] **Step 6: 运行变更路由验证**

Run:

```bash
make verify-changed
```

Expected:

```text
verify-changed completed successfully
```

If local Homebrew Node still fails with missing `llhttp`, rerun frontend checks with the bundled workspace Node path and record the exact failure in the final review note:

```bash
cd frontend && npm exec -- vitest run src/v2 --reporter=basic
```

- [ ] **Step 7: Commit**

```bash
git add \
  frontend/tests/e2e-v2/p35-field-candidate-layer.spec.ts \
  docs/architecture/semantic-field-candidate-layer.md \
  docs/quality/testing.md
git commit -m "test: verify semantic field candidate layer"
```

## 4. Review Checklist

Before marking the plan executed:

- [ ] `FieldCandidateSet` has no active / published status.
- [ ] Official runtime code paths do not import or read `field_candidates`.
- [ ] `SchemaSyncService` and candidate layer share `TypeCompatibilityPolicy`.
- [ ] `CubeModelingService.build_cube_draft_payload(columns=...)` internally creates candidates and emits `field_candidate_trace`.
- [ ] `draft-from-source` trace includes `draft_source_mode=compatibility_facade`.
- [ ] `p75_difficulty` and `completion_rate` become non-additive measures, not dimensions.
- [ ] `DECIMAL(10,4)`, `DOUBLE PRECISION`, `FLOAT(24)`, `NUMERIC(20,6)` are compatible with semantic `number`.
- [ ] Publish validation blocks `field_type_unknown`, `metric_aggregation_missing`, `non_additive_unconfirmed`, `candidate_snapshot_stale`, `dimension_metric_conflict`, `ratio_sum_risk`.
- [ ] Data asset pages do not offer direct Cube / Ontology publish from candidate suggestions.
- [ ] Architecture docs still state that data asset foundation is metadata facts only.

## 5. Self-Review

Spec coverage:

- 数据资产底座边界：Task 5, Task 8, Task 9.
- 字段候选层领域模型：Task 1, Task 2, Task 3.
- Cube 草案从候选生成：Task 4, Task 5, Task 6.
- 旧入口兼容 facade：Task 4, Task 6, Task 8.
- Copilot 冷启动与 Review：Task 5, Task 7, Task 8.
- 治理 issue 与发布阻断：Task 7.
- E2E 验收与文档：Task 9.

Placeholder scan:

- Plan contains no unresolved placeholder markers, no unspecified file paths, and every code-changing task includes concrete code blocks and commands.

Type consistency:

- `PhysicalTypeDescriptor`, `FieldCandidate`, `FieldCandidateSet`, `FieldCandidateService`, `SemanticFieldClassifier`, `MeasureSemanticsInferer`, `TypeCompatibilityPolicy` are introduced before first use in later tasks.
- API naming uses `field-candidates/preview`, `draft-from-candidates`, `candidate_set_id`, `field_candidate_trace`, `draft_source_mode` consistently.
