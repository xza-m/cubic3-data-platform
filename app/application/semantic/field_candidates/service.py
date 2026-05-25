"""字段候选集预览服务。"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Dict, Iterable, List, Optional

from .classifier import SemanticFieldClassifier
from .types import FieldCandidate, FieldCandidateSet


class FieldCandidateService:
    """基于字段证据生成首期内存态候选集。"""

    def __init__(
        self,
        classifier: Optional[SemanticFieldClassifier] = None,
        ruleset_version: str = "field-candidate-rules-v1",
    ):
        self._classifier = classifier or SemanticFieldClassifier()
        self._ruleset_version = ruleset_version

    def preview_from_columns(
        self,
        source: Dict[str, Any],
        columns: Iterable[Dict[str, Any]],
        selected_overrides: Optional[Dict[str, Any]] = None,
    ) -> FieldCandidateSet:
        normalized_source = self._normalize_source(source)
        normalized_columns = [self._normalize_column(column) for column in columns]
        overrides = selected_overrides or {}
        candidates = [
            self._classify_column(normalized_source, column, overrides.get(column["name"]))
            for column in normalized_columns
        ]
        candidate_set_id = self._candidate_set_id(normalized_source, normalized_columns, overrides)
        trace = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "override_scope": normalized_source.get("override_scope", "session"),
        }
        if overrides:
            trace["selected_overrides"] = overrides
        return FieldCandidateSet(
            candidate_set_id=candidate_set_id,
            ruleset_version=self._ruleset_version,
            source=normalized_source,
            fields=candidates,
            summary=self._summary(candidates),
            trace=trace,
        )

    def preview_from_evidence_bundle(
        self,
        source_id: str,
        database: str,
        schema: str,
        table: str,
        evidence_bundle: Dict[str, Any],
    ) -> FieldCandidateSet:
        schema_snapshot = self._read(evidence_bundle, "schema_snapshot", {}) or {}
        columns = self._read(schema_snapshot, "columns") or self._read(schema_snapshot, "fields") or []
        source_ref = self._build_source_ref(source_id, database, schema, table)
        source = {
            "source_kind": "asset_evidence",
            "source_id": source_id,
            "database": database,
            "schema": schema,
            "table": table,
            "source_ref": source_ref,
            "evidence_snapshot_id": self._read(schema_snapshot, "snapshot_id"),
        }
        return self.preview_from_columns(source, columns)

    def _classify_column(
        self,
        source: Dict[str, Any],
        column: Dict[str, Any],
        selected_override: Any = None,
    ) -> FieldCandidate:
        column_source = dict(self._read(column, "source", {}) or {})
        for key in ("source_kind", "source_ref", "evidence_snapshot_id", "source_id", "database", "schema", "table"):
            value = source.get(key)
            if value is not None:
                column_source.setdefault(key, value)
        if selected_override is not None:
            column_source["selected_override"] = selected_override
        candidate = self._classifier.classify_field({**column, "source": column_source})
        return replace(candidate, source=column_source)

    def _candidate_set_id(
        self,
        source: Dict[str, Any],
        columns: List[Dict[str, Any]],
        selected_overrides: Dict[str, Any],
    ) -> str:
        seed = {
            "ruleset_version": self._ruleset_version,
            "source": source,
            "columns": columns,
            "selected_overrides": selected_overrides,
        }
        digest = hashlib.sha1(
            json.dumps(seed, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        ).hexdigest()
        return f"fcand_{digest[:16]}"

    @staticmethod
    def _normalize_source(source: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(source or {})
        normalized.setdefault("source_kind", "unknown")
        return normalized

    @classmethod
    def _normalize_column(cls, column: Any) -> Dict[str, Any]:
        field_name = cls._first_value(column, ("name", "field_name", "physical_name"))
        data_type = cls._first_value(column, ("type", "data_type", "field_type"))
        comment = cls._first_value(column, ("comment", "description", "display_name"))
        normalized = dict(column) if isinstance(column, dict) else {}
        normalized["name"] = "" if field_name is None else str(field_name)
        normalized["type"] = "" if data_type is None else str(data_type)
        normalized["comment"] = "" if comment is None else str(comment)
        is_partition = cls._read(column, "is_partition")
        partition = cls._read(column, "partition")
        if is_partition is not None:
            normalized["is_partition"] = bool(is_partition)
        elif partition is not None:
            normalized["is_partition"] = bool(partition)
        source = cls._read(column, "source")
        if source is not None:
            normalized["source"] = source
        return normalized

    @staticmethod
    def _summary(fields: List[FieldCandidate]) -> Dict[str, int]:
        summary = {
            "dimensions": 0,
            "measures": 0,
            "time_fields": 0,
            "technical_fields": 0,
            "unknown": 0,
            "warnings": 0,
            "high_risk": 0,
        }
        for field in fields:
            if field.category == "dimension":
                summary["dimensions"] += 1
            elif field.category == "measure":
                summary["measures"] += 1
            elif field.category == "technical":
                summary["technical_fields"] += 1
            elif field.category == "unknown":
                summary["unknown"] += 1
            if field.semantic_type == "time" or field.selected_role == "dimension.time":
                summary["time_fields"] += 1
            summary["warnings"] += len(field.warnings)
            if field.risk_level == "high":
                summary["high_risk"] += 1
        return summary

    @staticmethod
    def _build_source_ref(source_id: str, database: str, schema: str, table: str) -> str:
        namespace = ".".join(part for part in (database, schema, table) if part)
        return f"{source_id}:{namespace}" if namespace else str(source_id)

    @staticmethod
    def _read(payload: Any, key: str, default: Any = None) -> Any:
        if isinstance(payload, dict):
            return payload.get(key, default)
        return getattr(payload, key, default)

    @classmethod
    def _first_value(cls, payload: Any, keys: tuple[str, ...]) -> Any:
        for key in keys:
            value = cls._read(payload, key)
            if value is not None:
                return value
        return None
