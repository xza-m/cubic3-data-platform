"""建模助手发布与 Runtime 可消费性检查。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


class PublishReadinessChecker:
    """统一计算建模产物是否可被正式 Agent Runtime 消费。"""

    def evaluate(self, spec: Dict[str, Any], validation: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        cube = spec.get("cube") or {}
        ontology = spec.get("ontology") or {}
        governance = spec.get("governance") or {}
        reasons: List[str] = []

        cube_status = str(cube.get("status") or "draft")
        ontology_status = self._ontology_status(ontology)
        binding_status = self._binding_status(spec)
        policy_status = self._policy_status(ontology, governance)

        if cube_status != "active":
            reasons.append("cube_not_active")
        if ontology_status != "active":
            reasons.append("ontology_not_active")
        if binding_status == "missing":
            reasons.append("binding_not_linked")
        elif binding_status not in {"linked", "approved", "active"}:
            reasons.append("binding_not_approved")
        if policy_status == "missing":
            reasons.append("policy_missing")
        if validation and any(issue.get("severity") == "error" for issue in validation.get("issues") or []):
            reasons.append("validation_blocked")

        return {
            "computed_by": "publish_readiness_checker",
            "canonical_ready": not reasons,
            "exploratory_ready": binding_status in {"linked", "approved", "active"} and "validation_blocked" not in reasons,
            "reasons": reasons,
            "truth_sources": {
                "business": "ontology",
                "execution": "cube",
                "domain": "business_context",
            },
            "checks": {
                "cube_status": cube_status,
                "ontology_status": ontology_status,
                "binding_status": binding_status,
                "policy_status": policy_status,
            },
        }

    def _ontology_status(self, ontology: Dict[str, Any]) -> str:
        statuses: List[str] = []
        object_payload = ontology.get("object")
        if isinstance(object_payload, dict):
            statuses.append(str(object_payload.get("status") or "draft"))
        for key in ("metrics", "glossary", "policies", "relations", "actions"):
            values = ontology.get(key) or []
            if not isinstance(values, list):
                continue
            for item in values:
                if isinstance(item, dict):
                    statuses.append(str(item.get("status") or "draft"))
        if statuses and all(status == "active" for status in statuses):
            return "active"
        if any(status == "deprecated" for status in statuses):
            return "deprecated"
        return "draft"

    def _binding_status(self, spec: Dict[str, Any]) -> str:
        cube = spec.get("cube") or {}
        cube_name = cube.get("name")
        measures = set((cube.get("measures") or {}).keys())
        metrics = (spec.get("ontology") or {}).get("metrics") or []
        if not metrics:
            return "missing"
        for metric in metrics:
            refs = metric.get("measure_refs") or []
            if not refs:
                return "missing"
            for measure_ref in refs:
                parsed_cube, parsed_measure = self._parse_measure_ref(measure_ref, cube_name)
                if parsed_cube != cube_name or parsed_measure not in measures:
                    return "missing"
            binding_lifecycle = str(metric.get("binding_status") or "approved")
            if binding_lifecycle not in {"approved", "active"}:
                return binding_lifecycle
        return "approved"

    def _policy_status(self, ontology: Dict[str, Any], governance: Dict[str, Any]) -> str:
        sensitivity = str(governance.get("sensitivity_level") or "restricted")
        sensitive_fields = governance.get("sensitive_fields") or []
        requires_policy = sensitivity != "public" or bool(sensitive_fields)
        policies = ontology.get("policies") or []
        if not requires_policy:
            return "not_required"
        return "valid" if policies else "missing"

    def _parse_measure_ref(self, measure_ref: str, default_cube_name: Optional[str]) -> tuple[Optional[str], str]:
        if "." not in measure_ref:
            return default_cube_name, measure_ref
        cube_name, measure_name = measure_ref.split(".", 1)
        return cube_name, measure_name
