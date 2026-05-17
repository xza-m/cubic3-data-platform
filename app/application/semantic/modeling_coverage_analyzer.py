"""建模 Proposal 覆盖度分析。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.application.semantic.publish_readiness_checker import PublishReadinessChecker


class CoverageAnalyzer:
    """用稳定阈值判断 Proposal 应复用、创建、人工确认还是阻断。"""

    COVERED_ONTOLOGY_SCORE = 0.8
    COVERED_CUBE_SCORE = 0.8
    HUMAN_BINDING_MARGIN = 0.15

    def __init__(self, readiness_checker: PublishReadinessChecker):
        self._readiness_checker = readiness_checker

    def evaluate(self, spec: Dict[str, Any], validation: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        explicit = spec.get("coverage") or {}
        readiness = self._readiness_checker.evaluate(spec, validation)
        binding_status = str(explicit.get("binding_status") or readiness["checks"]["binding_status"])
        policy_status = str(explicit.get("policy_status") or readiness["checks"]["policy_status"])
        ontology_score = float(explicit.get("ontology_score") or 0)
        cube_score = float(explicit.get("cube_score") or 0)
        blocking_reasons: List[str] = []

        if self._is_covered(ontology_score, cube_score, binding_status, policy_status):
            return {
                "decision": "covered",
                "ontology_score": ontology_score,
                "cube_score": cube_score,
                "binding_status": binding_status,
                "binding_coverage": "linked",
                "policy_coverage": policy_status,
                "blocking_reasons": [],
                "reusable_assets": explicit.get("reusable_assets") or [],
                "thresholds": self._thresholds(),
            }

        if binding_status == "missing":
            blocking_reasons.append("binding_coverage_missing")
        elif binding_status not in {"approved", "active", "linked"}:
            blocking_reasons.append("binding_not_approved")
        if policy_status == "missing":
            blocking_reasons.append("policy_missing")
        if validation and any(issue.get("severity") == "error" for issue in validation.get("issues") or []):
            blocking_reasons.append("validation_blocked")

        candidate_bindings = int(explicit.get("candidate_bindings") or 0)
        top_candidate_margin = float(explicit.get("top_candidate_margin") or 1)
        if candidate_bindings > 1 and top_candidate_margin < self.HUMAN_BINDING_MARGIN:
            decision = "need_human_binding"
        elif blocking_reasons:
            decision = "blocked"
        else:
            decision = "create_new"

        return {
            "decision": decision,
            "ontology_score": ontology_score,
            "cube_score": cube_score,
            "binding_status": binding_status,
            "binding_coverage": "linked" if binding_status in {"linked", "approved", "active"} else "missing",
            "policy_coverage": policy_status,
            "blocking_reasons": blocking_reasons,
            "reusable_assets": explicit.get("reusable_assets") or [],
            "thresholds": self._thresholds(),
        }

    def _is_covered(self, ontology_score: float, cube_score: float, binding_status: str, policy_status: str) -> bool:
        return (
            ontology_score >= self.COVERED_ONTOLOGY_SCORE
            and cube_score >= self.COVERED_CUBE_SCORE
            and binding_status in {"approved", "active"}
            and policy_status in {"valid", "not_required"}
        )

    def _thresholds(self) -> Dict[str, Any]:
        return {
            "covered": {
                "ontology_score": f">= {self.COVERED_ONTOLOGY_SCORE}",
                "cube_score": f">= {self.COVERED_CUBE_SCORE}",
                "binding_status": "approved|active",
                "policy_status": "valid|not_required",
            },
            "need_human_binding": {
                "candidate_bindings": "> 1",
                "top_candidate_margin": f"< {self.HUMAN_BINDING_MARGIN}",
            },
        }
