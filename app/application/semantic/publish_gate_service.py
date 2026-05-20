"""语义资产发布 Gate。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Literal

from app.domain.semantic.asset_registry import SemanticAssetDependency, SemanticAssetRevision
from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog


GateDecision = Literal["allow", "deny", "approval_required"]


@dataclass(frozen=True)
class PublishGateResult:
    decision: GateDecision
    reasons: list[str] = field(default_factory=list)
    checks: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"decision": self.decision, "reasons": self.reasons, "checks": self.checks}


class PublishGateService:
    """生产发布 Gate，按固定顺序阻断不可发布资产。"""

    def __init__(
        self,
        *,
        schema_checker: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        binding_compiler: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        runtime_compiler: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        policy_checker: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        allowed_sensitivity_levels: set[str] | None = None,
        approval_required_sensitivity_levels: set[str] | None = None,
    ):
        self._schema_checker = schema_checker
        self._binding_compiler = binding_compiler
        self._runtime_compiler = runtime_compiler
        self._policy_checker = policy_checker
        self._allowed_sensitivity_levels = allowed_sensitivity_levels or {
            "public",
            "internal",
            "confidential",
            "restricted",
        }
        self._approval_required_sensitivity_levels = approval_required_sensitivity_levels or {
            "confidential",
            "restricted",
        }

    @classmethod
    def production(cls) -> "PublishGateService":
        """生产默认 Gate：启用内置 schema、binding、policy、runtime checker。"""

        return cls(
            schema_checker=_check_runtime_schema,
            binding_compiler=_compile_bindings,
            runtime_compiler=_compile_runtime_manifest,
            policy_checker=_check_policy_metadata,
        )

    def evaluate(
        self,
        revision: SemanticAssetRevision,
        *,
        approved_spec_hash: str | None,
        approval_record: dict[str, Any] | None,
        dependencies: Iterable[SemanticAssetDependency],
    ) -> PublishGateResult:
        reasons: list[str] = []
        checks: dict[str, Any] = {}
        approved_hash = approved_spec_hash or (approval_record or {}).get("approved_spec_hash")
        if approved_hash != revision.spec_checksum:
            return PublishGateResult(
                decision="deny",
                reasons=["approved_spec_stale"],
                checks={"expected": approved_hash, "actual": revision.spec_checksum},
            )

        dependency_items = list(dependencies)
        if self._has_dependency_cycle(revision, dependency_items):
            return PublishGateResult(
                decision="deny",
                reasons=["dependency_cycle_detected"],
                checks={"dependency_count": len(dependency_items)},
            )

        spec = revision.spec_json or {}
        schema_result = self._run_external_check(
            name="schema",
            checker=self._schema_checker,
            spec=spec,
            failure_reason="schema_check_failed",
        )
        if schema_result is not None:
            checks["schema"] = schema_result.checks["schema"]
            if schema_result.decision != "allow":
                return PublishGateResult(
                    decision=schema_result.decision,
                    reasons=schema_result.reasons,
                    checks=checks,
                )

        binding_result = self._run_external_check(
            name="binding",
            checker=self._binding_compiler,
            spec=spec,
            failure_reason="binding_compile_failed",
        )
        if binding_result is not None:
            checks["binding"] = binding_result.checks["binding"]
            if binding_result.decision != "allow":
                return PublishGateResult(
                    decision=binding_result.decision,
                    reasons=binding_result.reasons,
                    checks=checks,
                )

        governance = spec.get("governance") or {}
        sensitivity = str(governance.get("sensitivity_level") or "restricted")
        if sensitivity not in self._allowed_sensitivity_levels:
            return PublishGateResult(
                decision="deny",
                reasons=["sensitivity_level_unsupported"],
                checks={"sensitivity_level": sensitivity},
            )
        approval_granted = bool(
            governance.get("approval_granted")
            or (approval_record or {}).get("approval_granted")
            or (approval_record or {}).get("approved")
        )
        if sensitivity in self._approval_required_sensitivity_levels and not approval_granted:
            reason = (
                "restricted_requires_approval"
                if sensitivity == "restricted"
                else "sensitivity_requires_approval"
            )
            return PublishGateResult(
                decision="approval_required",
                reasons=[reason],
                checks={"sensitivity_level": sensitivity},
            )

        policy_result = self._run_external_check(
            name="policy",
            checker=self._policy_checker,
            spec=spec,
            failure_reason="policy_denied",
        )
        if policy_result is not None:
            checks["policy"] = policy_result.checks["policy"]
            if policy_result.decision != "allow":
                return PublishGateResult(
                    decision=policy_result.decision,
                    reasons=policy_result.reasons,
                    checks=checks,
                )

        policies = (spec.get("ontology") or {}).get("policies") or []
        if not policies:
            return PublishGateResult(
                decision="deny",
                reasons=["policy_missing"],
                checks={"sensitivity_level": sensitivity},
            )

        cube = spec.get("cube") or {}
        if str(cube.get("status") or "draft") != "active":
            reasons.append("cube_not_active")

        runtime_result = self._run_external_check(
            name="runtime",
            checker=self._runtime_compiler,
            spec=spec,
            failure_reason="runtime_compile_failed",
        )
        if runtime_result is not None:
            checks["runtime"] = runtime_result.checks["runtime"]
            if runtime_result.decision != "allow":
                return PublishGateResult(
                    decision=runtime_result.decision,
                    reasons=runtime_result.reasons,
                    checks=checks,
                )

        if reasons:
            return PublishGateResult(decision="deny", reasons=reasons, checks=checks)
        checks.update(
            {
                "approved_checksum": revision.spec_checksum,
                "dependency_count": len(dependency_items),
                "sensitivity_level": sensitivity,
            }
        )
        return PublishGateResult(
            decision="allow",
            reasons=[],
            checks=checks,
        )

    def _run_external_check(
        self,
        *,
        name: str,
        checker: Callable[[dict[str, Any]], dict[str, Any]] | None,
        spec: dict[str, Any],
        failure_reason: str,
    ) -> PublishGateResult | None:
        if checker is None:
            return None
        payload = checker(spec) or {}
        if self._external_check_passed(payload):
            return PublishGateResult(decision="allow", checks={name: payload})
        return PublishGateResult(
            decision="deny",
            reasons=[failure_reason],
            checks={name: payload},
        )

    @staticmethod
    def _external_check_passed(payload: dict[str, Any]) -> bool:
        if payload.get("ok") is False:
            return False
        status = str(payload.get("status") or payload.get("decision") or "").lower()
        if status in {"blocked", "deny", "denied", "failed", "error"}:
            return False
        if status in {"ready", "allow", "allowed", "passed", "success"}:
            return True
        return payload.get("ok", True) is True

    def _has_dependency_cycle(
        self,
        revision: SemanticAssetRevision,
        dependencies: list[SemanticAssetDependency],
    ) -> bool:
        return any(item.depends_on_asset_id == revision.asset_id for item in dependencies)


def _check_runtime_schema(spec: dict[str, Any]) -> dict[str, Any]:
    try:
        catalog = _catalog_from_spec(spec)
    except ValueError as exc:
        return {"ok": False, "errors": [str(exc)]}
    return {
        "ok": True,
        "counts": _catalog_counts(catalog),
    }


def _compile_bindings(spec: dict[str, Any]) -> dict[str, Any]:
    bindings = spec.get("bindings") or []
    if not isinstance(bindings, list):
        return {"ok": False, "errors": ["bindings_must_be_list"]}
    measure_names = _cube_measure_names(spec)
    metric_names = _semantic_metric_names(spec)
    errors: list[str] = []
    for binding in bindings:
        if not isinstance(binding, dict):
            errors.append("binding_must_be_object")
            continue
        target = str(
            binding.get("metric")
            or binding.get("measure")
            or binding.get("name")
            or ""
        ).strip()
        if not target:
            errors.append("binding_missing_metric")
        elif target not in measure_names and target not in metric_names:
            errors.append(f"binding_target_not_found:{target}")
    return {"ok": not errors, "errors": errors, "binding_count": len(bindings)}


def _compile_runtime_manifest(spec: dict[str, Any]) -> dict[str, Any]:
    try:
        catalog = _catalog_from_spec(spec)
    except ValueError as exc:
        return {"ok": False, "errors": [str(exc)]}
    return {"ok": True, "counts": _catalog_counts(catalog)}


def _check_policy_metadata(spec: dict[str, Any]) -> dict[str, Any]:
    policies = (spec.get("ontology") or {}).get("policies") or []
    if not isinstance(policies, list):
        return {"ok": False, "errors": ["ontology.policies_must_be_list"]}
    errors = [
        f"policy_missing_name:{index}"
        for index, policy in enumerate(policies)
        if not isinstance(policy, dict) or not str(policy.get("name") or "").strip()
    ]
    return {"ok": not errors, "errors": errors, "policy_count": len(policies)}


def _catalog_from_spec(spec: dict[str, Any]) -> RuntimeSemanticCatalog:
    return RuntimeSemanticCatalog.from_manifest(
        {
            "snapshot_id": "gate_check",
            "release_id": "gate_check",
            "asset_manifest_json": {
                "schema_version": "semantic-runtime-manifest/v1",
                "assets": [
                    {
                        "asset_id": "gate_asset",
                        "asset_type": "cube" if "cube" in spec else "ontology",
                        "asset_key": str((spec.get("cube") or {}).get("name") or "gate_asset"),
                        "revision_id": "gate_revision",
                        "spec_checksum": "0" * 64,
                        "spec": spec,
                        "status": "published",
                    }
                ],
            },
        }
    )


def _catalog_counts(catalog: RuntimeSemanticCatalog) -> dict[str, int]:
    return {
        "objects": len(catalog.list_entities("object")),
        "metrics": len(catalog.list_entities("metric")),
        "glossary": len(catalog.list_entities("glossary")),
        "relations": len(catalog.list_entities("relation")),
        "actions": len(catalog.list_entities("action")),
        "cubes": len(catalog.list_entities("cube")),
    }


def _cube_measure_names(spec: dict[str, Any]) -> set[str]:
    measures = (spec.get("cube") or {}).get("measures") or {}
    if isinstance(measures, dict):
        return {str(name) for name in measures}
    if isinstance(measures, list):
        return {str(item.get("name")) for item in measures if isinstance(item, dict) and item.get("name")}
    return set()


def _semantic_metric_names(spec: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    metric = spec.get("metric")
    if isinstance(metric, dict) and metric.get("name"):
        names.add(str(metric["name"]))
    ontology_metrics = (spec.get("ontology") or {}).get("metrics") or []
    if isinstance(ontology_metrics, list):
        names.update(
            str(item["name"])
            for item in ontology_metrics
            if isinstance(item, dict) and item.get("name")
        )
    return names
