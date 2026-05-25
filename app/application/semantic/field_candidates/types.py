"""字段候选层的物理类型映射与兼容策略。"""
from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class PhysicalTypeDescriptor:
    raw_type: str
    normalized_type: str
    family: str
    precision: Optional[int] = None
    scale: Optional[int] = None
    nullable: Optional[bool] = None
    source_dialect: Optional[str] = None


@dataclass(frozen=True)
class FieldIssue:
    code: str
    severity: str = "medium"
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {"code": self.code, "severity": self.severity, "message": self.message}


@dataclass(frozen=True)
class MeasureSemantics:
    aggregation: str
    additivity: str
    default_format: str = "decimal"
    unit: Optional[str] = None
    is_ratio: bool = False
    percentile: Optional[int] = None
    recommended_name: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    issues: List[FieldIssue] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "aggregation": self.aggregation,
            "additivity": self.additivity,
            "default_format": self.default_format,
            "unit": self.unit,
            "is_ratio": self.is_ratio,
            "percentile": self.percentile,
            "recommended_name": self.recommended_name,
            "warnings": self.warnings,
            "issues": [issue.to_dict() for issue in self.issues],
        }


@dataclass(frozen=True)
class FieldRoleCandidate:
    role: str
    confidence: float
    category: str = ""
    semantic_type: str = ""
    reasons: List[str] = field(default_factory=list)
    issues: List[FieldIssue] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "category": self.category,
            "semantic_type": self.semantic_type,
            "confidence": self.confidence,
            "reasons": self.reasons,
            "issues": [issue.to_dict() for issue in self.issues],
        }


@dataclass(frozen=True)
class FieldCandidate:
    field: str
    physical_type: PhysicalTypeDescriptor
    semantic_type: str
    role_candidates: List[FieldRoleCandidate]
    selected_role: str
    category: str = ""
    measure_semantics: Optional[MeasureSemantics] = None
    warnings: List[str] = field(default_factory=list)
    issue_codes: List[str] = field(default_factory=list)
    issues: List[FieldIssue] = field(default_factory=list)
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
            "role_candidates": [item.to_dict() for item in self.role_candidates],
            "selected_role": self.selected_role,
            "category": self.category,
            "measure_semantics": None if self.measure_semantics is None else self.measure_semantics.to_dict(),
            "warnings": self.warnings,
            "issue_codes": self.issue_codes,
            "issues": [issue.to_dict() for issue in self.issues],
            "risk_level": self.risk_level,
            "decision": self.decision,
            "source": self.source,
        }


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
            "fields": [field.to_dict() for field in self.fields],
        }


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
            return PhysicalTypeDescriptor(
                raw_type,
                self._NUMBER_TYPES[base_type],
                "number",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type in self._STRING_TYPES:
            return PhysicalTypeDescriptor(
                raw_type,
                self._STRING_TYPES[base_type],
                "string",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type in self._TIME_TYPES:
            return PhysicalTypeDescriptor(
                raw_type,
                self._TIME_TYPES[base_type],
                "time",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type in self._BOOLEAN_TYPES:
            return PhysicalTypeDescriptor(
                raw_type,
                "boolean",
                "boolean",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type in self._JSON_TYPES:
            return PhysicalTypeDescriptor(
                raw_type,
                "json",
                "json",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type.startswith("varchar"):
            return PhysicalTypeDescriptor(
                raw_type,
                "varchar",
                "string",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type.startswith("char"):
            return PhysicalTypeDescriptor(
                raw_type,
                "char",
                "string",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        if base_type.startswith("timestamp"):
            return PhysicalTypeDescriptor(
                raw_type,
                "timestamp",
                "time",
                precision,
                scale,
                nullable,
                source_dialect,
            )
        return PhysicalTypeDescriptor(
            raw_type,
            base_type or "unknown",
            "unknown",
            precision,
            scale,
            nullable,
            source_dialect,
        )

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
        "string": {"string"},
        "number": {"number"},
        "time": {"time", "string"},
        "boolean": {"boolean"},
    }

    def __init__(self, mapper: PhysicalTypeMapper | None = None):
        self._mapper = mapper or PhysicalTypeMapper()

    def descriptor(self, physical_type: str) -> PhysicalTypeDescriptor:
        return self._mapper.parse(physical_type)

    def semantic_primitive(self, physical_type: str) -> str:
        return self.descriptor(physical_type).family

    def is_compatible(self, physical_type: str, semantic_type: str) -> bool:
        descriptor = self.descriptor(physical_type)
        semantic = str(semantic_type or "").lower()
        if semantic == "boolean":
            return descriptor.family == "boolean" or descriptor.normalized_type == "tinyint"
        expected = self._COMPATIBLE.get(semantic)
        if not expected:
            return False
        return descriptor.family in expected
