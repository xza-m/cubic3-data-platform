"""语义资产发布 Gate。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Literal

from app.domain.ontology.entities import normalize_cube_bindings, normalize_measure_refs
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
    """单 spec 形态的绑定校验：复用 §1.3 断链校验矩阵（解析范围仅为本 spec）。"""
    matrix = check_binding_matrix([spec])
    return {
        "ok": matrix["ok"],
        "errors": [f"{item['code']}:{item['path']}" for item in matrix["blockers"]],
        "blockers": matrix["blockers"],
        "binding_count": matrix["checked"]["metrics"] + matrix["checked"]["objects"],
    }


class _BindingResolutionScope:
    """断链校验解析范围 = 同批发布资产 ∪ 当前 active manifest。"""

    def __init__(self, specs: Iterable[dict[str, Any]], active_catalog: RuntimeSemanticCatalog | None):
        self._batch_cubes: dict[str, dict[str, Any]] = {}
        self._batch_objects: dict[str, list[dict[str, Any]]] = {}
        self._active_catalog = active_catalog
        for spec in specs:
            if not isinstance(spec, dict):
                continue
            for cube_payload in _iter_cube_payloads(spec):
                name = str(cube_payload.get("name") or "").strip()
                if name:
                    self._batch_cubes[name] = cube_payload
            for object_payload in _iter_ontology_assets(spec, "object"):
                name = str(object_payload.get("name") or "").strip()
                if name:
                    self._batch_objects[name] = normalize_cube_bindings(object_payload.get("cube_bindings"))

    def cube_measures(self, cube_name: str) -> set[str] | None:
        cube = self._batch_cubes.get(cube_name)
        if cube is not None:
            return _payload_keys(cube.get("measures"))
        return self._active_cube_attr(cube_name, "measures")

    def cube_dimensions(self, cube_name: str) -> set[str] | None:
        cube = self._batch_cubes.get(cube_name)
        if cube is not None:
            return _payload_keys(cube.get("dimensions"))
        return self._active_cube_attr(cube_name, "dimensions")

    def cube_joins(self, cube_name: str) -> set[str] | None:
        cube = self._batch_cubes.get(cube_name)
        if cube is not None:
            return _payload_keys(cube.get("joins"))
        return self._active_cube_attr(cube_name, "joins")

    def cube_exists(self, cube_name: str) -> bool:
        return self.cube_measures(cube_name) is not None

    def object_bindings(self, object_name: str) -> list[dict[str, Any]] | None:
        bindings = self._batch_objects.get(object_name)
        if bindings is not None:
            return bindings
        if self._active_catalog is None:
            return None
        entity = self._active_catalog.get_object(object_name)
        if entity is None:
            return None
        return normalize_cube_bindings(getattr(entity, "cube_bindings", None))

    def _active_cube_attr(self, cube_name: str, attr: str) -> set[str] | None:
        if self._active_catalog is None:
            return None
        cube = self._active_catalog.cube_repository.get(cube_name)
        if cube is None:
            return None
        return {str(key) for key in (getattr(cube, attr, None) or {})}


def check_binding_matrix(
    specs: list[dict[str, Any]],
    *,
    active_catalog: RuntimeSemanticCatalog | None = None,
) -> dict[str, Any]:
    """设计 §1.3 发布期断链校验矩阵。

    任一断链即 blocker；解析范围 =「同批发布资产 ∪ 当前 active manifest」。
    """
    scope = _BindingResolutionScope(specs, active_catalog)
    blockers: list[dict[str, str]] = []
    checked = {"metrics": 0, "objects": 0, "relations": 0, "actions": 0}

    def _block(code: str, path: str, message: str) -> None:
        blockers.append({"code": code, "path": path, "message": message})

    for spec in specs:
        if not isinstance(spec, dict):
            continue
        for metric in _iter_ontology_assets(spec, "metric"):
            checked["metrics"] += 1
            metric_name = str(metric.get("name") or "unnamed_metric")
            refs = normalize_measure_refs(metric.get("measure_refs"))
            primary_refs = [item["ref"] for item in refs if item["role"] == "primary"]
            if not refs or len(primary_refs) != 1:
                _block(
                    "metric_binding_missing",
                    f"ontology.metrics.{metric_name}.measure_refs",
                    f"BusinessMetric {metric_name} 缺少唯一 primary measure 引用",
                )
                continue
            cube_name, _, measure_name = primary_refs[0].partition(".")
            measures = scope.cube_measures(cube_name)
            if not cube_name or not measure_name or measures is None or measure_name not in measures:
                _block(
                    "metric_binding_unresolved",
                    f"ontology.metrics.{metric_name}.measure_refs",
                    f"BusinessMetric {metric_name} 的 primary 引用 {primary_refs[0]} 无法解析到同批或 active manifest 内的 cube.measure",
                )
        for object_payload in _iter_ontology_assets(spec, "object"):
            checked["objects"] += 1
            object_name = str(object_payload.get("name") or "unnamed_object")
            bindings = normalize_cube_bindings(object_payload.get("cube_bindings"))
            primary_count = sum(1 for item in bindings if item.get("role") == "primary")
            if not bindings or primary_count > 1:
                _block(
                    "object_binding_missing",
                    f"ontology.objects.{object_name}.cube_bindings",
                    f"BusinessObject {object_name} 缺少 cube_bindings 或 primary 绑定不唯一",
                )
                continue
            for binding in bindings:
                cube_name = str(binding.get("cube") or "")
                dimensions = scope.cube_dimensions(cube_name)
                entity_key = binding.get("entity_key")
                if dimensions is None:
                    _block(
                        "object_binding_unresolved",
                        f"ontology.objects.{object_name}.cube_bindings",
                        f"BusinessObject {object_name} 绑定的 cube {cube_name} 不在同批或 active manifest 内",
                    )
                elif entity_key and str(entity_key) not in dimensions:
                    _block(
                        "object_binding_unresolved",
                        f"ontology.objects.{object_name}.cube_bindings",
                        f"BusinessObject {object_name} 的 entity_key {entity_key} 不是 cube {cube_name} 的维度",
                    )
        for relation in _iter_ontology_assets(spec, "relation"):
            checked["relations"] += 1
            relation_name = str(relation.get("name") or "unnamed_relation")
            source_object = str(relation.get("source_object_name") or "")
            target_object = str(relation.get("target_object_name") or "")
            source_bindings = scope.object_bindings(source_object)
            target_bindings = scope.object_bindings(target_object)
            if not source_bindings or not target_bindings:
                _block(
                    "relation_join_unresolved",
                    f"ontology.relations.{relation_name}",
                    f"BusinessRelation {relation_name} 两端对象缺少 cube binding，join path 无法解析",
                )
                continue
            source_cube = _primary_binding_cube(source_bindings)
            target_cube = _primary_binding_cube(target_bindings)
            if not _join_path_resolvable(scope, source_cube, target_cube):
                _block(
                    "relation_join_unresolved",
                    f"ontology.relations.{relation_name}",
                    f"BusinessRelation {relation_name} 的 join path 无法经 cube.joins 解析（{source_cube} ↔ {target_cube}）",
                )
        for action in _iter_ontology_assets(spec, "action"):
            checked["actions"] += 1
            action_name = str(action.get("name") or "unnamed_action")
            for event_ref in action.get("event_cube_refs") or []:
                if not scope.cube_exists(str(event_ref)):
                    _block(
                        "action_binding_unresolved",
                        f"ontology.actions.{action_name}.event_cube_refs",
                        f"BusinessAction {action_name} 的 event cube 引用 {event_ref} 无法解析",
                    )

    return {"ok": not blockers, "blockers": blockers, "checked": checked}


def _primary_binding_cube(bindings: list[dict[str, Any]]) -> str:
    for binding in bindings:
        if binding.get("role") == "primary":
            return str(binding.get("cube") or "")
    return str(bindings[0].get("cube") or "") if bindings else ""


def _join_path_resolvable(scope: _BindingResolutionScope, source_cube: str, target_cube: str) -> bool:
    if not source_cube or not target_cube:
        return False
    if not scope.cube_exists(source_cube) or not scope.cube_exists(target_cube):
        return False
    if source_cube == target_cube:
        return True
    source_joins = scope.cube_joins(source_cube) or set()
    target_joins = scope.cube_joins(target_cube) or set()
    return target_cube in source_joins or source_cube in target_joins


def _iter_cube_payloads(spec: dict[str, Any]) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    cube = spec.get("cube")
    if isinstance(cube, dict) and cube.get("name"):
        payloads.append(cube)
    # 单资产 manifest spec：cube spec 直接平铺在顶层
    if spec.get("name") and spec.get("dimensions") and spec.get("measures"):
        payloads.append(spec)
    return payloads


def _iter_ontology_assets(spec: dict[str, Any], asset_kind: str) -> list[dict[str, Any]]:
    """提取 spec 内某类 ontology 资产，兼容单数 / 复数 / 顶层平铺三种形态。"""
    plural = {"object": "objects", "metric": "metrics", "relation": "relations", "action": "actions"}[asset_kind]
    items: list[dict[str, Any]] = []
    top_level = spec.get(asset_kind)
    if isinstance(top_level, dict) and top_level.get("name"):
        items.append(top_level)
    ontology = spec.get("ontology") or {}
    if isinstance(ontology, dict):
        value = ontology.get(plural) or ontology.get(asset_kind)
        if isinstance(value, dict):
            items.append(value)
        elif isinstance(value, list):
            items.extend(item for item in value if isinstance(item, dict))
    return items


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


def _payload_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return {str(name) for name in value}
    if isinstance(value, list):
        return {str(item.get("name")) for item in value if isinstance(item, dict) and item.get("name")}
    return set()
