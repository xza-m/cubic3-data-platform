"""语义治理问题归一化服务。"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from app.application.semantic.schema_sync_service import SyncReport


_SCHEMA_DRIFT_CODE_MAP = {
    "missing_in_physical": "physical_schema_missing_column",
    "missing_in_cube": "physical_schema_new_column",
    "type_mismatch": "physical_type_changed",
    "enum_source_unavailable": "enum_source_unavailable",
    "missing_join_target_cube": "cube_binding_invalid",
    "missing_join_column": "cube_binding_invalid",
    "missing_join_target_column": "cube_binding_invalid",
    "cross_source_join": "cube_binding_invalid",
    "invalid_view_reference": "view_binding_invalid",
    "invalid_view_field": "view_binding_invalid",
}

_MAPPER_STALE_CODE_MAP = {
    "metric": "ontology_measure_ref_stale",
    "relation": "ontology_relation_projection_stale",
    "action": "ontology_action_event_cube_stale",
}


@dataclass
class GovernanceIssue:
    code: str
    source: str
    object_type: str
    object_name: str
    severity: str = "warn"
    resource_ref: str = ""
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def issue_id(self) -> str:
        raw = f"{self.source}:{self.code}:{self.object_type}:{self.object_name}:{self.resource_ref}"
        return raw.lower().replace(" ", "_")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.issue_id,
            "code": self.code,
            "source": self.source,
            "severity": self.severity,
            "object_type": self.object_type,
            "object_name": self.object_name,
            "resource_ref": self.resource_ref,
            "message": self.message,
            "metadata": self.metadata,
        }


class SemanticGovernanceIssueService:
    """把 Schema drift 和语义映射 stale-check 转成统一治理问题。"""

    def build_payload(
        self,
        *,
        schema_report: Optional[SyncReport] = None,
        mapper_stale_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        issues: List[GovernanceIssue] = []
        if schema_report is not None:
            issues.extend(self.from_schema_report(schema_report))
        if mapper_stale_payload is not None:
            issues.extend(self.from_mapper_stale_payload(mapper_stale_payload))

        items = [issue.to_dict() for issue in issues]
        return {"summary": self._summary(issues), "items": items}

    def from_schema_report(self, report: SyncReport) -> List[GovernanceIssue]:
        issues: List[GovernanceIssue] = []
        drift_cubes = set()
        for drift in report.drifts:
            code = _SCHEMA_DRIFT_CODE_MAP.get(drift.kind, f"schema_drift_{drift.kind}")
            object_type = drift.object_type or "cube"
            object_name = drift.object_name or drift.cube
            if object_type == "cube" and object_name:
                drift_cubes.add(object_name)
            resource_ref = self._schema_resource_ref(drift.table, drift.column)
            issues.append(
                GovernanceIssue(
                    code=code,
                    source="schema_sync",
                    object_type=object_type,
                    object_name=object_name,
                    severity=drift.severity or "warn",
                    resource_ref=resource_ref,
                    message=drift.detail,
                    metadata={
                        "cube": drift.cube,
                        "table": drift.table,
                        "kind": drift.kind,
                        "column": drift.column,
                    },
                )
            )
        for cube_name in report.skipped_cubes:
            if cube_name in drift_cubes:
                continue
            issues.append(
                GovernanceIssue(
                    code="schema_sync_skipped",
                    source="schema_sync",
                    object_type="cube",
                    object_name=cube_name,
                    severity="warn",
                    resource_ref=cube_name,
                    message="Schema sync 未完成：未能读取物理 Schema，或该 Cube 不适用本次检测",
                    metadata={
                        "cube": cube_name,
                        "kind": "skipped",
                    },
                )
            )
        return issues

    def from_mapper_stale_payload(self, payload: Dict[str, Any]) -> List[GovernanceIssue]:
        issues: List[GovernanceIssue] = []
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            entity_type = str(item.get("entity_type") or "unknown")
            entity_name = str(item.get("entity_name") or "")
            code = _MAPPER_STALE_CODE_MAP.get(entity_type, "ontology_projection_stale")
            missing_refs = item.get("missing_refs") or []
            resource_ref = ", ".join(str(ref) for ref in missing_refs) if missing_refs else entity_name
            issues.append(
                GovernanceIssue(
                    code=code,
                    source="semantic_mapper",
                    object_type=entity_type,
                    object_name=entity_name,
                    severity="warn",
                    resource_ref=resource_ref,
                    message=str(item.get("reason") or "语义映射引用已失效"),
                    metadata={
                        "status": item.get("status"),
                        "missing_refs": missing_refs,
                    },
                )
            )
        return issues

    @staticmethod
    def _schema_resource_ref(table: str, column: str) -> str:
        if table and column:
            return f"{table}.{column}"
        return column or table

    @staticmethod
    def _summary(issues: Iterable[GovernanceIssue]) -> Dict[str, Any]:
        issue_list = list(issues)
        by_code = Counter(issue.code for issue in issue_list)
        by_source = Counter(issue.source for issue in issue_list)
        error_count = sum(1 for issue in issue_list if issue.severity == "error")
        warn_count = len(issue_list) - error_count
        return {
            "issue_count": len(issue_list),
            "error_count": error_count,
            "warn_count": warn_count,
            "status": "error" if error_count else ("warn" if issue_list else "ok"),
            "by_code": dict(by_code),
            "by_source": dict(by_source),
        }
