"""字段角色分类与指标语义推断。"""
from __future__ import annotations

import re
from typing import Any, Dict

from .types import (
    FieldCandidate,
    FieldIssue,
    FieldRoleCandidate,
    MeasureSemantics,
    PhysicalTypeMapper,
    TypeCompatibilityPolicy,
)


class MeasureSemanticsInferer:
    """根据字段名和注释推断指标聚合与可加性。"""

    _RATIO_TOKENS = ("rate", "ratio", "pct", "percent", "率", "比例", "百分比")

    def infer(self, field_name: str, comment: str = "") -> MeasureSemantics:
        lower_name = field_name.lower()
        text = f"{lower_name} {comment}"
        percentile = self._percentile_value(text)
        if percentile is not None:
            return MeasureSemantics(
                "percentile",
                "non_additive",
                percentile=percentile,
                recommended_name=self._measure_name("pctl", field_name),
                warnings=["分位数指标不可直接跨粒度聚合，需要确认分位口径"],
                issues=[
                    FieldIssue(
                        code="percentile_non_additive_unconfirmed",
                        severity="high",
                        message="分位数指标需要确认跨粒度聚合口径",
                    )
                ],
            )
        if lower_name == "max" or lower_name.startswith("max_") or lower_name.endswith("_max"):
            return MeasureSemantics("max", "non_additive", recommended_name=field_name)
        if lower_name == "min" or lower_name.startswith("min_") or lower_name.endswith("_min"):
            return MeasureSemantics("min", "non_additive", recommended_name=field_name)
        if self._is_non_additive(text):
            is_ratio = self._is_ratio_text(text)
            return MeasureSemantics(
                "avg",
                "non_additive",
                is_ratio=is_ratio,
                recommended_name=self._measure_name("avg", field_name),
                warnings=["非可加指标需要确认跨粒度聚合口径"],
                issues=[
                    FieldIssue(
                        code="ratio_sum_risk" if is_ratio else "non_additive_unconfirmed",
                        severity="high",
                        message="比率类指标不能按 sum 汇总" if is_ratio else "非可加指标需要确认跨粒度聚合口径",
                    )
                ],
            )
        return MeasureSemantics("sum", "additive", recommended_name=self._measure_name("sum", field_name))

    @staticmethod
    def _percentile_value(text: str) -> int | None:
        patterns = (
            r"(?:^|[^A-Za-z0-9])p(\d{1,3})(?=$|[^A-Za-z0-9])",
            r"percentile\s*[_: -]?(\d{1,3})",
            r"(\d{1,3})\s*分位数?",
        )
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if not match:
                continue
            value = int(match.group(1))
            if 0 < value <= 100:
                return value
        return None

    @classmethod
    def _is_non_additive(cls, text: str) -> bool:
        return bool(
            cls._percentile_value(text) is not None
            or any(
                token in text
                for token in (
                    "_rate",
                    "_ratio",
                    "_pct",
                    "_percent",
                    "_avg",
                    "_mean",
                    "_median",
                    "_stddev",
                    "_variance",
                    "_wow",
                    "_mom",
                    "_yoy",
                    "rate",
                    "ratio",
                    "pct",
                    "percent",
                    "avg_",
                    "mean_",
                    "median_",
                    "stddev_",
                    "variance_",
                    "比率",
                    "率",
                    "比例",
                    "百分比",
                    "均值",
                    "平均",
                    "分位",
                    "中位数",
                    "标准差",
                    "方差",
                    "环比",
                    "同比",
                )
            )
        )

    @staticmethod
    def _is_ratio_text(text: str) -> bool:
        return any(token in text for token in MeasureSemanticsInferer._RATIO_TOKENS)

    @staticmethod
    def _measure_name(prefix: str, field_name: str) -> str:
        lower_name = field_name.lower()
        if lower_name.startswith(f"{prefix}_") or lower_name.endswith(f"_{prefix}"):
            return field_name
        return f"{prefix}_{field_name}"


class SemanticFieldClassifier:
    """把字段证据分类为维度、指标、技术字段或未知字段。"""

    _ID_SUFFIXES = ("_id", "_key", "_code", "_no")
    _NUMERIC_DIM_NAMES = {"level", "grade", "rank", "status", "type", "class", "category"}
    _NUMERIC_DIM_SUFFIXES = ("_level", "_grade", "_rank", "_status", "_type", "_class", "_category")
    _BOOLEAN_PREFIXES = ("is_", "has_", "can_", "should_", "allow_", "enable_")
    _BOOLEAN_SUFFIXES = ("_flag", "_enabled", "_disabled")
    _BOOLEAN_NAMES = {"flag"}
    _TECHNICAL_FIELDS = {"ds", "dt", "pt", "__lifecycle__", "create_time", "update_time", "is_deleted"}
    _TECHNICAL_SUFFIXES = ("_create_time", "_created_time", "_update_time", "_updated_time", "_deleted")
    _PARTITION_NAMES = {"partition", "partition_date", "partition_time", "pt", "dt", "ds"}
    _MEASURE_SUFFIXES = (
        "_cnt",
        "_count",
        "_sum",
        "_total",
        "_amt",
        "_amount",
        "_num",
        "_number",
        "_price",
        "_rate",
        "_ratio",
        "_pct",
        "_percent",
        "_quantity",
        "_qty",
        "_value",
        "_score",
        "_duration",
        "_cost",
        "_fee",
        "_balance",
        "_avg",
        "_mean",
        "_median",
        "_stddev",
        "_variance",
        "_wow",
        "_mom",
        "_yoy",
    )
    _MEASURE_PREFIXES = ("avg_", "mean_", "median_", "stddev_", "std_", "variance_", "max_", "min_")
    _BARE_MEASURE_NAMES = {"rate", "ratio", "percent", "pct", "max", "min"}

    def __init__(
        self,
        mapper: PhysicalTypeMapper | None = None,
        compatibility_policy: TypeCompatibilityPolicy | None = None,
        measure_inferer: MeasureSemanticsInferer | None = None,
    ):
        self._policy = compatibility_policy or TypeCompatibilityPolicy(mapper)
        self._measure_inferer = measure_inferer or MeasureSemanticsInferer()

    def classify_field(self, column: Dict[str, Any]) -> FieldCandidate:
        field_name = str(column.get("name") or column.get("field_name") or column.get("physical_name") or "").strip()
        comment = str(column.get("comment") or column.get("description") or column.get("display_name") or "").strip()
        raw_type = str(column.get("type") or column.get("data_type") or "")
        descriptor = self._policy.descriptor(raw_type)
        lower_name = field_name.lower()
        source = dict(column.get("source") or {})

        if not field_name:
            return self._candidate(
                field_name,
                descriptor,
                "unknown",
                "unknown",
                0.0,
                ["字段名为空"],
                ["field_name_missing"],
                "high",
                source,
            )
        if descriptor.family == "unknown":
            return self._candidate(
                field_name,
                descriptor,
                "unknown",
                "unknown",
                0.0,
                ["物理类型无法识别"],
                ["field_type_unknown"],
                "high",
                source,
            )
        if self._is_partition_name(lower_name) or column.get("is_partition"):
            return self._candidate(
                field_name,
                descriptor,
                descriptor.family,
                "technical.partition",
                0.88,
                ["分区或技术字段"],
                ["partition_field_detected"],
                "low",
                source,
            )
        if lower_name in self._TECHNICAL_FIELDS or any(lower_name.endswith(suffix) for suffix in self._TECHNICAL_SUFFIXES):
            return self._candidate(
                field_name,
                descriptor,
                descriptor.family if lower_name != "is_deleted" else "boolean",
                "technical.audit",
                0.68,
                ["审计、软删或技术治理字段"],
                ["technical_field_review"],
                "medium",
                source,
            )
        if lower_name == "id" or any(lower_name.endswith(suffix) for suffix in self._ID_SUFFIXES):
            return self._candidate(
                field_name,
                descriptor,
                descriptor.family,
                "dimension.identifier",
                0.92,
                ["字段名是 ID / Key / Code"],
                [],
                "low",
                source,
            )
        if descriptor.family == "time":
            return self._candidate(
                field_name,
                descriptor,
                "time",
                "dimension.time",
                0.94,
                ["物理类型为时间"],
                [],
                "low",
                source,
            )
        if lower_name.endswith("_at") or lower_name in {"date", "time"}:
            return self._candidate(
                field_name,
                descriptor,
                "time",
                "dimension.time",
                0.88,
                ["字段名像时间字段"],
                [],
                "medium",
                source,
            )
        if self._is_boolean_field(raw_type, descriptor, lower_name):
            return self._candidate(
                field_name,
                descriptor,
                "boolean",
                "dimension.boolean",
                0.9,
                ["布尔或标记字段"],
                [],
                "low",
                source,
            )
        if descriptor.family == "number" and self._is_measure_name(lower_name, comment):
            semantics = self._measure_inferer.infer(field_name, comment)
            issues = self._measure_issue_codes(semantics)
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
        if descriptor.family == "number" and (
            lower_name in self._NUMERIC_DIM_NAMES
            or any(lower_name.endswith(suffix) for suffix in self._NUMERIC_DIM_SUFFIXES)
        ):
            return self._candidate(
                field_name,
                descriptor,
                "number",
                "dimension.numeric",
                0.82,
                ["数值枚举或等级字段"],
                [],
                "medium",
                source,
            )
        if descriptor.family == "number":
            semantics = self._measure_inferer.infer(field_name, comment)
            issues = self._measure_issue_codes(semantics)
            return self._candidate(
                field_name,
                descriptor,
                "number",
                f"measure.{semantics.additivity}",
                0.72,
                ["数值字段默认作为可度量指标"],
                issues,
                "high" if issues else "low",
                source,
                measure_semantics=semantics,
            )
        return self._candidate(
            field_name,
            descriptor,
            descriptor.family,
            "dimension.categorical",
            0.72,
            ["默认作为可分组维度"],
            [],
            "low",
            source,
        )

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
        warnings = list(measure_semantics.warnings) if measure_semantics else []
        if "non_additive_unconfirmed" in issue_codes:
            warnings.append("非可加指标需要确认聚合口径")
        if "field_type_unknown" in issue_codes:
            warnings.append("字段类型无法映射到平台语义类型")
        if "ratio_sum_risk" in issue_codes:
            warnings.append("比率类指标不能按 sum 汇总")
        if "partition_field_detected" in issue_codes:
            warnings.append("字段疑似分区字段，进入 Cube 草案前需要确认使用方式")
        if "technical_field_review" in issue_codes:
            warnings.append("技术字段不应作为高置信业务候选")
        issues = self._issues(issue_codes)
        category = role.split(".", 1)[0] if "." in role else role
        return FieldCandidate(
            field=field_name,
            physical_type=descriptor,
            semantic_type=semantic_type,
            role_candidates=[
                FieldRoleCandidate(
                    role=role,
                    category=category,
                    semantic_type=semantic_type,
                    confidence=confidence,
                    reasons=reasons,
                    issues=issues,
                )
            ],
            selected_role=role,
            category=category,
            measure_semantics=measure_semantics,
            warnings=warnings,
            issue_codes=issue_codes,
            issues=issues,
            risk_level=risk_level,
            source=source,
        )

    @staticmethod
    def _measure_issue_codes(semantics: MeasureSemantics) -> list[str]:
        codes = [issue.code for issue in semantics.issues]
        if semantics.additivity != "additive" and "non_additive_unconfirmed" not in codes:
            codes.append("non_additive_unconfirmed")
        if semantics.is_ratio and "ratio_sum_risk" not in codes:
            codes.append("ratio_sum_risk")
        return codes

    @staticmethod
    def _issues(issue_codes: list[str]) -> list[FieldIssue]:
        messages = {
            "field_name_missing": ("high", "字段名为空"),
            "field_type_unknown": ("high", "字段类型无法映射到平台语义类型"),
            "non_additive_unconfirmed": ("high", "非可加指标需要确认聚合口径"),
            "percentile_non_additive_unconfirmed": ("high", "分位数指标需要确认跨粒度聚合口径"),
            "ratio_sum_risk": ("high", "比率类指标不能按 sum 汇总"),
            "partition_field_detected": ("medium", "字段疑似分区字段"),
            "technical_field_review": ("medium", "技术字段不应作为高置信业务候选"),
        }
        return [
            FieldIssue(code=code, severity=messages.get(code, ("medium", ""))[0], message=messages.get(code, ("medium", ""))[1])
            for code in issue_codes
        ]

    def _is_boolean_field(self, raw_type: str, descriptor, lower_name: str) -> bool:
        if descriptor.family == "boolean":
            return True
        if not self._policy.is_compatible(raw_type, "boolean"):
            return False
        return (
            any(lower_name.startswith(prefix) for prefix in self._BOOLEAN_PREFIXES)
            or any(lower_name.endswith(suffix) for suffix in self._BOOLEAN_SUFFIXES)
            or lower_name in self._BOOLEAN_NAMES
        )

    def _is_partition_name(self, lower_name: str) -> bool:
        return lower_name in self._PARTITION_NAMES or lower_name.startswith("partition_")

    def _is_measure_name(self, lower_name: str, comment: str) -> bool:
        text = f"{lower_name} {comment}"
        if lower_name in self._BARE_MEASURE_NAMES:
            return True
        if self._measure_inferer._percentile_value(text) is not None:
            return True
        if self._measure_inferer._is_non_additive(text):
            return True
        if any(lower_name.endswith(suffix) for suffix in self._MEASURE_SUFFIXES):
            return True
        if any(lower_name.startswith(prefix) for prefix in self._MEASURE_PREFIXES):
            return True
        if re.match(r"^p\d{1,3}(_|$)", lower_name) or re.search(r"_p\d{1,3}(_|$)", lower_name):
            return True
        return any(keyword in comment for keyword in ("金额", "数量", "比例", "百分比", "次数", "平均", "均值", "难度", "分位"))
