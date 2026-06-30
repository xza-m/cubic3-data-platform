"""建模 Proposal 校验矩阵规则。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List
from app.domain.ontology.entities import measure_ref_strings


class ValidationMatrixBuilder:
    """将构建期规则统一归入 blockers / warnings / infos。"""

    def build(self, spec: Dict[str, Any], validation: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        matrix = {"blockers": [], "warnings": [], "infos": []}
        for issue in validation.get("issues") or []:
            normalized = self._normalize_issue(issue)
            severity = normalized.get("severity")
            if severity == "error":
                matrix["blockers"].append(normalized)
            elif severity == "warning":
                matrix["warnings"].append(normalized)
            else:
                matrix["infos"].append(normalized)
        matrix["blockers"].extend(self._metric_blockers(spec))
        matrix["blockers"].extend(self._binding_blockers(spec))
        matrix["blockers"].extend(self._evidence_blockers(spec))
        return matrix

    def _metric_blockers(self, spec: Dict[str, Any]) -> List[Dict[str, Any]]:
        blockers: List[Dict[str, Any]] = []
        cube = spec.get("cube") or {}
        cube_dimensions = cube.get("dimensions") or {}
        cube_name = str(cube.get("name") or cube.get("table") or "")
        cube_measures = cube.get("measures") if isinstance(cube.get("measures"), dict) else {}
        active_bindings = spec.get("active_bindings") or {}
        for metric in (spec.get("ontology") or {}).get("metrics") or []:
            metric_name = metric.get("name") or "(unknown)"
            if not metric.get("grain"):
                blockers.append(self._blocker("metric_grain_missing", f"BusinessMetric {metric_name} 缺少 grain", f"ontology.metrics.{metric_name}.grain"))
            time_dimension = metric.get("time_dimension")
            if not time_dimension:
                blockers.append(self._blocker("metric_time_dimension_missing", f"BusinessMetric {metric_name} 缺少默认 time dimension", f"ontology.metrics.{metric_name}.time_dimension"))
            elif time_dimension not in cube_dimensions:
                blockers.append(self._blocker("metric_time_dimension_missing", f"BusinessMetric {metric_name} 的 time dimension 未映射到 Cube dimension", f"ontology.metrics.{metric_name}.time_dimension"))
            additivity = metric.get("additivity")
            if not additivity:
                blockers.append(self._blocker("metric_additivity_missing", f"BusinessMetric {metric_name} 缺少可加性声明", f"ontology.metrics.{metric_name}.additivity"))
            if metric.get("sql") or metric.get("execution_sql"):
                blockers.append(self._blocker("generated_sql_bypasses_cube", f"BusinessMetric {metric_name} 不允许携带直拼 SQL", f"ontology.metrics.{metric_name}.sql"))
            active_ref = active_bindings.get(metric_name)
            refs = measure_ref_strings(metric.get("measure_refs"))
            if active_ref and refs and active_ref not in refs:
                blockers.append(self._blocker("active_binding_conflict", f"BusinessMetric {metric_name} 与已有 active binding 冲突", f"ontology.metrics.{metric_name}.measure_refs"))
            blockers.extend(self._measure_ref_integrity_blockers(metric_name, refs, additivity, cube_name, cube_measures))
        return blockers

    def _measure_ref_integrity_blockers(
        self,
        metric_name: str,
        refs: List[str],
        additivity: Any,
        cube_name: str,
        cube_measures: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """校验 measure_ref 指向度量的真实存在性 + additivity 与度量可加性一致性。

        repair 不再静默把 typo ref 改回默认度量，故这里必须把 typo / 危险可加性方向拦成 blocker。
        ref 前缀 cube 名与当前 cube 不一致（多 cube 场景，非本平台单 cube 主线）时跳过，避免误伤。
        """
        blockers: List[Dict[str, Any]] = []
        path = f"ontology.metrics.{metric_name}.measure_refs"
        for ref in refs:
            if "." not in ref:
                continue
            parsed_cube, parsed_measure = ref.split(".", 1)
            if cube_name and parsed_cube != cube_name:
                continue
            if not cube_measures:
                continue
            measure_payload = cube_measures.get(parsed_measure)
            if measure_payload is None:
                blockers.append(self._blocker(
                    "metric_measure_ref_unknown",
                    f"BusinessMetric {metric_name} 绑定的度量 {ref} 不存在于 Cube measures",
                    path,
                ))
                continue
            # additive 度量被声明 non_additive 属保守方向，不拦；non_additive 度量被标 additive
            # 会把比率/均值跨维 SUM，是危险方向，拦成 blocker。
            if isinstance(measure_payload, dict) and measure_payload.get("non_additive") is True and additivity == "additive":
                blockers.append(self._blocker(
                    "metric_additivity_mismatch",
                    f"BusinessMetric {metric_name} 声明 additive，但绑定度量 {ref} 为 non_additive（不可跨维相加）",
                    path,
                ))
        return blockers

    def _binding_blockers(self, spec: Dict[str, Any]) -> List[Dict[str, Any]]:
        blockers: List[Dict[str, Any]] = []
        for metric in (spec.get("ontology") or {}).get("metrics") or []:
            status = metric.get("binding_status")
            if status and status not in {"approved", "active"}:
                metric_name = metric.get("name") or "(unknown)"
                blockers.append(self._blocker("binding_lifecycle_not_approved", f"BusinessMetric {metric_name} 的 binding 尚未 approved/active", f"ontology.metrics.{metric_name}.binding_status"))
        return blockers

    def _evidence_blockers(self, spec: Dict[str, Any]) -> List[Dict[str, Any]]:
        items = (spec.get("evidence_pack") or {}).get("items") or []
        if not items:
            return []
        blockers: List[Dict[str, Any]] = []
        usable_items = []
        for item in items:
            trust_level = str(item.get("trust_level") or "P3")
            expired = self._is_expired(item.get("valid_until"))
            if expired and trust_level in {"P0", "P1"}:
                blockers.append(self._blocker("evidence_expired", f"高可信证据 {item.get('id')} 已过期", f"evidence_pack.items.{item.get('id')}"))
            if not expired:
                usable_items.append(item)

        if usable_items and all(str(item.get("trust_level") or "P3") == "P3" for item in usable_items):
            blockers.append(self._blocker("evidence_trust_too_low", "只有 P3 证据不能进入 validated", "evidence_pack.items"))

        claims: Dict[str, str] = {}
        for item in usable_items:
            trust_level = str(item.get("trust_level") or "P3")
            if trust_level not in {"P0", "P1"}:
                continue
            key = str(item.get("claim_key") or item.get("type") or "")
            claim = str(item.get("extracted_claim") or "")
            if key in claims and claims[key] != claim:
                blockers.append(self._blocker("evidence_conflict", f"P0/P1 证据在 {key} 上存在冲突", f"evidence_pack.items.{item.get('id')}"))
            claims[key] = claim
        return blockers

    def _normalize_issue(self, issue: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(issue)
        normalized.setdefault("code", normalized.get("path") or "validation_issue")
        return normalized

    def _blocker(self, code: str, message: str, path: str) -> Dict[str, str]:
        return {"severity": "error", "code": code, "path": path, "message": message}

    def _is_expired(self, valid_until: Any) -> bool:
        if not valid_until:
            return False
        try:
            value = str(valid_until).replace("Z", "+00:00")
            return datetime.fromisoformat(value) < datetime.now(timezone.utc)
        except ValueError:
            return False
