"""只读语义投影预览与一致性检测。"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List

from app.domain.ontology.entities import (
    BusinessAction,
    BusinessMetric,
    BusinessObject,
    BusinessRelation,
    GlossaryEntry,
)
from app.domain.ontology.ports.action_repository import IBusinessActionRepository
from app.domain.ontology.ports.glossary_repository import IGlossaryRepository
from app.domain.ontology.ports.metric_repository import IBusinessMetricRepository
from app.domain.ontology.ports.object_repository import IBusinessObjectRepository
from app.domain.ontology.ports.relation_repository import IBusinessRelationRepository
from app.domain.semantic.entities import CubeDefinition
from app.domain.semantic.ports.cube_repository import ICubeRepository


def _normalize(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.lower())


class SemanticMapperPreviewService:
    def __init__(
        self,
        *,
        object_repository: IBusinessObjectRepository,
        metric_repository: IBusinessMetricRepository,
        glossary_repository: IGlossaryRepository,
        relation_repository: IBusinessRelationRepository,
        action_repository: IBusinessActionRepository,
        cube_repository: ICubeRepository,
    ):
        self._object_repository = object_repository
        self._metric_repository = metric_repository
        self._glossary_repository = glossary_repository
        self._relation_repository = relation_repository
        self._action_repository = action_repository
        self._cube_repository = cube_repository

    def preview(self, *, entity_type: str, entity_name: str) -> Dict[str, Any]:
        if entity_type == "object":
            entity = self._object_repository.get(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务对象: {entity_name}")
            return self._with_binding_contract(self._preview_object(entity))
        if entity_type == "metric":
            entity = self._metric_repository.get(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务指标: {entity_name}")
            return self._with_binding_contract(self._preview_metric(entity))
        if entity_type == "relation":
            entity = self._relation_repository.get(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务关系: {entity_name}")
            return self._with_binding_contract(self._preview_relation(entity))
        if entity_type == "action":
            entity = self._action_repository.get(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务动作: {entity_name}")
            return self._with_binding_contract(self._preview_action(entity))
        if entity_type == "glossary":
            entity = self._glossary_repository.get(entity_name)
            if entity is None:
                raise ValueError(f"未找到术语: {entity_name}")
            return self._with_binding_contract(self._preview_glossary(entity))
        raise ValueError(f"不支持的预览类型: {entity_type}")

    def consistency_report(self) -> Dict[str, Any]:
        items = self.stale_check()["items"]
        linked_measure_refs = 0
        for metric in self._metric_repository.list_all():
            linked_measure_refs += sum(1 for ref in metric.measure_ref_strings() if self._resolve_measure_ref(ref) is not None)
        return {
            "summary": {
                "object_count": len(self._object_repository.list_all()),
                "metric_count": len(self._metric_repository.list_all()),
                "relation_count": len(self._relation_repository.list_all()),
                "action_count": len(self._action_repository.list_all()),
                "glossary_count": len(self._glossary_repository.list_all()),
                "issue_count": len(items),
                "linked_measure_ref_count": linked_measure_refs,
            },
            "items": items,
        }

    def stale_check(self) -> Dict[str, Any]:
        issues: List[Dict[str, Any]] = []
        for metric in self._metric_repository.list_all():
            missing = [ref for ref in metric.measure_ref_strings() if self._resolve_measure_ref(ref) is None]
            if missing:
                issues.append(
                    {
                        "entity_type": "metric",
                        "entity_name": metric.name,
                        "status": "stale",
                        "reason": "存在无法解析的 Measure 引用",
                        "missing_refs": missing,
                    }
                )
        for relation in self._relation_repository.list_all():
            if not self._relation_join_targets(relation):
                issues.append(
                    {
                        "entity_type": "relation",
                        "entity_name": relation.name,
                        "status": "stale",
                        "reason": "未找到可投影的 Join Path",
                    }
                )
        for action in self._action_repository.list_all():
            missing_event_cubes = [ref for ref in action.event_cube_refs if self._cube_repository.get(ref) is None]
            if missing_event_cubes:
                issues.append(
                    {
                        "entity_type": "action",
                        "entity_name": action.name,
                        "status": "stale",
                        "reason": "存在无法解析的 Event Cube 引用",
                        "missing_refs": missing_event_cubes,
                    }
                )
        return {
            "summary": {
                "stale_count": len(issues),
                "status": "stale" if issues else "fresh",
                "linked_measure_ref_count": sum(
                    1
                    for metric in self._metric_repository.list_all()
                    for ref in metric.measure_ref_strings()
                    if self._resolve_measure_ref(ref) is not None
                ),
            },
            "items": issues,
        }

    def diff(self) -> Dict[str, Any]:
        items: List[Dict[str, Any]] = []
        for entity in self._object_repository.list_all():
            preview = self._preview_object(entity)
            items.append(
                {
                    "entity_type": "object",
                    "entity_name": entity.name,
                    "target_count": len(preview["projection"]["targets"]),
                }
            )
        for entity in self._metric_repository.list_all():
            preview = self._preview_metric(entity)
            items.append(
                {
                    "entity_type": "metric",
                    "entity_name": entity.name,
                    "target_count": len(preview["projection"]["targets"]),
                }
            )
        for entity in self._relation_repository.list_all():
            preview = self._preview_relation(entity)
            items.append(
                {
                    "entity_type": "relation",
                    "entity_name": entity.name,
                    "target_count": len(preview["projection"]["targets"]),
                }
            )
        for entity in self._action_repository.list_all():
            preview = self._preview_action(entity)
            items.append(
                {
                    "entity_type": "action",
                    "entity_name": entity.name,
                    "target_count": len(preview["projection"]["targets"]),
                }
            )
        return {"items": items, "total": len(items)}

    def metric_links(self, metric_name: str) -> Dict[str, Any]:
        metric = self._metric_repository.get(metric_name)
        if metric is None:
            raise ValueError(f"未找到业务指标: {metric_name}")

        linked_measures: List[Dict[str, Any]] = []
        linked_cubes: List[Dict[str, Any]] = []
        consistency_issues: List[str] = []

        for ref in metric.measure_ref_strings():
            resolved = self._resolve_measure_ref(ref)
            if resolved is None:
                linked_measures.append(
                    {
                        "measure_ref": ref,
                        "status": "stale",
                    }
                )
                consistency_issues.append(f"未解析 Measure 引用: {ref}")
                continue
            cube, measure_name = resolved
            measure = cube.measures[measure_name]
            linked_measures.append(
                {
                    "measure_ref": ref,
                    "status": "linked",
                    "cube_name": cube.name,
                    "cube_title": cube.title,
                    "measure_name": measure_name,
                    "measure_title": measure.title,
                }
            )
            if not any(item["cube_name"] == cube.name for item in linked_cubes):
                linked_cubes.append(
                    {
                        "cube_name": cube.name,
                        "cube_title": cube.title,
                        "status": "linked",
                    }
                )

        return {
            "metric_name": metric.name,
            "metric_title": metric.title,
            "object_name": metric.object_name,
            "semantic_formula": metric.semantic_formula,
            "linked_measures": linked_measures,
            "linked_cubes": linked_cubes,
            "consistency": {
                "status": "ok" if not consistency_issues else "stale",
                "issues": consistency_issues,
            },
        }

    def measure_backlinks(self, measure_ref: str) -> Dict[str, Any]:
        resolved = self._resolve_measure_ref(measure_ref)
        cube_name, _, measure_name = measure_ref.partition(".")
        linked_metrics: List[Dict[str, Any]] = []
        for metric in self._metric_repository.list_all():
            if measure_ref not in metric.measure_ref_strings():
                continue
            linked_metrics.append(
                {
                    "metric_name": metric.name,
                    "metric_title": metric.title,
                    "object_name": metric.object_name,
                    "status": "linked" if resolved is not None else "stale",
                }
            )

        payload: Dict[str, Any] = {
            "measure_ref": measure_ref,
            "cube_name": cube_name,
            "measure_name": measure_name,
            "linked_metrics": linked_metrics,
            "status": "linked" if linked_metrics and resolved is not None else "orphan",
        }
        if resolved is not None:
            cube, resolved_measure_name = resolved
            measure = cube.measures[resolved_measure_name]
            payload["measure_title"] = measure.title
            payload["cube_title"] = cube.title
        return payload

    def cube_backlinks(self, cube_name: str) -> Dict[str, Any]:
        cube = self._cube_repository.get(cube_name)
        linked_objects: List[Dict[str, Any]] = []
        linked_metrics: List[Dict[str, Any]] = []

        for entity in self._object_repository.list_all():
            for candidate in self._object_projection_targets(entity):
                if candidate["target_name"] != cube_name:
                    continue
                linked_objects.append(
                    {
                        "object_name": entity.name,
                        "object_title": entity.title,
                        "status": "linked" if cube is not None else "stale",
                        "score": candidate.get("score"),
                        "match_reason": candidate.get("match_reason"),
                    }
                )
                break

        if cube is not None:
            measure_refs = {f"{cube.name}.{measure_name}" for measure_name in cube.measures}
            for metric in self._metric_repository.list_all():
                if not measure_refs.intersection(metric.measure_ref_strings()):
                    continue
                linked_metrics.append(
                    {
                        "metric_name": metric.name,
                        "metric_title": metric.title,
                        "object_name": metric.object_name,
                        "status": "linked",
                    }
                )

        payload: Dict[str, Any] = {
            "cube_name": cube_name,
            "linked_objects": linked_objects,
            "linked_metrics": linked_metrics,
            "status": "linked" if cube is not None and (linked_objects or linked_metrics) else "orphan",
        }
        if cube is not None:
            payload["cube_title"] = cube.title
        return payload

    def policy_impact(self, policy: Dict[str, Any]) -> Dict[str, Any]:
        target_type = str(policy.get("target_type") or "").strip()
        target_name = str(policy.get("target_name") or "").strip()
        visibility = str(policy.get("visibility") or "restricted").strip() or "restricted"
        allowed_roles = [str(role).strip() for role in (policy.get("allowed_roles") or []) if str(role).strip()]

        analysis_links: Dict[str, Any] = {
            "cubes": [],
            "measures": [],
            "join_paths": [],
            "event_cubes": [],
        }
        issues: List[str] = []
        projection_status = "pending"

        if target_type == "metric" and target_name:
            metric_links = self.metric_links(target_name)
            analysis_links["cubes"] = metric_links["linked_cubes"]
            analysis_links["measures"] = metric_links["linked_measures"]
            projection_status = metric_links["consistency"]["status"]
            issues.extend(metric_links["consistency"]["issues"])
        elif target_type == "object" and target_name:
            preview = self.preview(entity_type="object", entity_name=target_name)
            analysis_links["cubes"] = preview["projection"]["targets"]
            projection_status = str(preview["consistency"]["status"])
            issues.extend(str(issue) for issue in preview["consistency"]["issues"])
        elif target_type == "action" and target_name:
            preview = self.preview(entity_type="action", entity_name=target_name)
            analysis_links["event_cubes"] = preview["projection"]["targets"]
            projection_status = str(preview["consistency"]["status"])
            issues.extend(str(issue) for issue in preview["consistency"]["issues"])
        elif target_type == "property":
            projection_status = "pending"
            issues.append("属性级权限尚未接入字段暴露执行链，当前仅提供影响范围说明。")

        linked_entity_count = sum(len(items) for items in analysis_links.values() if isinstance(items, list))
        governance_hooks = [
            {
                "hook": "semantic-router",
                "status": "active" if target_type in {"object", "metric", "action"} else "pending",
                "effect": "route-block",
            },
            {
                "hook": "execution-compiler",
                "status": "active" if target_type == "metric" else "pending",
                "effect": "execute-block" if target_type == "metric" else "preview-only",
            },
            {
                "hook": "field-exposure",
                "status": "pending" if target_type == "property" else "planned",
                "effect": "field-visibility",
            },
            {
                "hook": "audit-lineage",
                "status": "planned",
                "effect": "governance-trace",
            },
        ]
        return {
            "target_type": target_type,
            "target_name": target_name,
            "visibility": visibility,
            "allowed_roles": allowed_roles,
            "projection_status": projection_status,
            "linked_entity_count": linked_entity_count,
            "analysis_links": analysis_links,
            "governance_hooks": governance_hooks,
            "issues": issues,
        }

    def _preview_object(self, entity: BusinessObject) -> Dict[str, Any]:
        targets = []
        for cube in self._cube_repository.list_all():
            score = self._match_score(entity.name, entity.title, entity.aliases, [cube.name, cube.title])
            if score <= 0:
                continue
            targets.append(
                {
                    "target_type": "cube",
                    "target_name": cube.name,
                    "title": cube.title,
                    "score": score,
                    "match_reason": "名称/标题/别名匹配",
                }
            )
        targets.sort(key=lambda item: (-item["score"], item["target_name"]))
        return {
            "entity": entity.model_dump(mode="json"),
            "projection": {"targets": targets},
            "consistency": {
                "status": "ok" if targets else "warning",
                "issues": [] if targets else ["未找到可投影的 Cube 候选"],
            },
            "traceability": {
                "object_name": entity.name,
                "object_title": entity.title,
                "aliases": entity.aliases,
                "cube_candidates": targets,
            },
        }

    def _preview_metric(self, entity: BusinessMetric) -> Dict[str, Any]:
        targets = []
        issues = []
        for ref in entity.measure_ref_strings():
            resolved = self._resolve_measure_ref(ref)
            if resolved is None:
                issues.append(f"未解析 Measure 引用: {ref}")
                continue
            cube, measure_name = resolved
            measure = cube.measures[measure_name]
            targets.append(
                {
                    "target_type": "measure",
                    "target_name": f"{cube.name}.{measure_name}",
                    "measure_ref": f"{cube.name}.{measure_name}",
                    "cube_name": cube.name,
                    "measure_name": measure_name,
                    "measure_title": measure.title,
                    "match_reason": "显式 measure_refs 映射",
                }
            )
        if not targets and not entity.measure_refs:
            for cube in self._cube_repository.list_all():
                for measure_name, measure in cube.measures.items():
                    score = self._match_score(entity.name, entity.title, entity.aliases, [measure_name, measure.title])
                    if score <= 0:
                        continue
                    targets.append(
                        {
                            "target_type": "measure",
                            "target_name": f"{cube.name}.{measure_name}",
                            "measure_ref": f"{cube.name}.{measure_name}",
                            "cube_name": cube.name,
                            "measure_name": measure_name,
                            "measure_title": measure.title,
                            "score": score,
                            "match_reason": "名称/标题/别名匹配",
                        }
                    )
        return {
            "entity": entity.model_dump(mode="json"),
            "projection": {"targets": targets},
            "consistency": {
                "status": "ok" if not issues else "stale",
                "issues": issues,
            },
            "traceability": self.metric_links(entity.name),
        }

    def _preview_glossary(self, entity: GlossaryEntry) -> Dict[str, Any]:
        related = []
        if entity.entry_type == "metric" and self._metric_repository.get(entity.canonical_name):
            related.append({"target_type": "metric", "target_name": entity.canonical_name})
        if entity.entry_type == "object" and self._object_repository.get(entity.canonical_name):
            related.append({"target_type": "object", "target_name": entity.canonical_name})
        return {
            "entity": entity.model_dump(mode="json"),
            "projection": {"targets": related},
            "consistency": {
                "status": "ok" if related else "warning",
                "issues": [] if related else ["术语未关联到已注册业务语义对象"],
            },
        }

    def _preview_relation(self, entity: BusinessRelation) -> Dict[str, Any]:
        targets = self._relation_join_targets(entity)
        source_object = self._object_repository.get(entity.source_object_name)
        target_object = self._object_repository.get(entity.target_object_name)
        source_candidates = [] if source_object is None else self._object_projection_targets(source_object)
        target_candidates = [] if target_object is None else self._object_projection_targets(target_object)
        issues: List[str] = []
        if source_object is None:
            issues.append(f"未找到源业务对象: {entity.source_object_name}")
        if target_object is None:
            issues.append(f"未找到目标业务对象: {entity.target_object_name}")
        if source_object is not None and not source_candidates:
            issues.append("源业务对象尚未找到可投影的分析实体")
        if target_object is not None and not target_candidates:
            issues.append("目标业务对象尚未找到可投影的分析实体")
        if not targets and not issues:
            issues.append("未找到可投影的 Join Path")
        return {
            "entity": entity.model_dump(mode="json"),
            "projection": {"targets": targets},
            "consistency": {
                "status": "ok" if targets and not issues else "warning",
                "issues": issues,
            },
            "traceability": {
                "relation_name": entity.name,
                "source_object": entity.source_object_name,
                "target_object": entity.target_object_name,
                "source_candidates": source_candidates,
                "target_candidates": target_candidates,
            },
        }

    def _preview_action(self, entity: BusinessAction) -> Dict[str, Any]:
        targets: List[Dict[str, Any]] = []
        issues: List[str] = []
        object_entity = self._object_repository.get(entity.object_name)
        object_candidates = [] if object_entity is None else self._object_projection_targets(object_entity)
        if object_entity is None:
            issues.append(f"未找到业务对象: {entity.object_name}")
        for cube_ref in entity.event_cube_refs:
            cube = self._cube_repository.get(cube_ref)
            if cube is None:
                issues.append(f"未解析 Event Cube 引用: {cube_ref}")
                continue
            targets.append(
                {
                    "target_type": "event_cube",
                    "target_name": cube.name,
                    "title": cube.title,
                    "match_reason": "显式 event_cube_refs 映射",
                }
            )
        if not targets and not entity.event_cube_refs:
            aliases = [] if object_entity is None else object_entity.aliases
            for cube in self._cube_repository.list_all():
                score = self._match_score(entity.name, entity.title, aliases + entity.aliases, [cube.name, cube.title])
                if score <= 0:
                    continue
                targets.append(
                    {
                        "target_type": "event_cube",
                        "target_name": cube.name,
                        "title": cube.title,
                        "score": score,
                        "match_reason": "名称/标题/别名匹配",
                    }
                )
        if object_entity is not None and not object_candidates:
            issues.append("归属业务对象尚未找到可投影的分析实体")
        if not targets and not issues:
            issues.append("未找到可投影的 Event Cube")
        return {
            "entity": entity.model_dump(mode="json"),
            "projection": {"targets": targets},
            "consistency": {
                "status": "ok" if targets and not issues else "warning" if targets else "stale",
                "issues": issues,
            },
            "traceability": {
                "action_name": entity.name,
                "object_name": entity.object_name,
                "trigger_time_property": entity.trigger_time_property,
                "object_candidates": object_candidates,
                "event_cube_refs": entity.event_cube_refs,
            },
        }

    def _relation_join_targets(self, entity: BusinessRelation) -> List[Dict[str, Any]]:
        source_object = self._object_repository.get(entity.source_object_name)
        target_object = self._object_repository.get(entity.target_object_name)
        if source_object is None or target_object is None:
            return []
        source_candidates = self._object_projection_targets(source_object)
        target_names = {item["target_name"] for item in self._object_projection_targets(target_object)}
        targets: List[Dict[str, Any]] = []
        for candidate in source_candidates:
            cube = self._cube_repository.get(candidate["target_name"])
            if cube is None:
                continue
            for join_name, join in cube.joins.items():
                if join.cube not in target_names:
                    continue
                targets.append(
                    {
                        "target_type": "join_path",
                        "target_name": join.cube,
                        "join_path": f"{cube.name}.{join_name}",
                        "source_cube": cube.name,
                        "target_cube": join.cube,
                        "relationship": join.relationship,
                        "match_reason": "对象候选 Cube 与 Join 目标匹配",
                    }
                )
        return targets

    def _object_projection_targets(self, entity: BusinessObject) -> List[Dict[str, Any]]:
        targets = []
        for cube in self._cube_repository.list_all():
            score = self._match_score(entity.name, entity.title, entity.aliases, [cube.name, cube.title])
            if score <= 0:
                continue
            targets.append(
                {
                    "target_type": "cube",
                    "target_name": cube.name,
                    "title": cube.title,
                    "score": score,
                    "match_reason": "名称/标题/别名匹配",
                }
            )
        targets.sort(key=lambda item: (-item["score"], item["target_name"]))
        return targets

    def _resolve_measure_ref(self, ref: str) -> tuple[CubeDefinition, str] | None:
        cube_name, _, measure_name = ref.partition(".")
        if not cube_name or not measure_name:
            return None
        cube = self._cube_repository.get(cube_name)
        if cube is None or measure_name not in cube.measures:
            return None
        return cube, measure_name

    def _with_binding_contract(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        resolved_bindings = [self._normalize_binding(target) for target in payload.get("projection", {}).get("targets", [])]
        issues = [str(issue) for issue in payload.get("consistency", {}).get("issues", [])]
        consistency_status = str(payload.get("consistency", {}).get("status") or "warning")
        if consistency_status == "ok":
            binding_status = "linked" if resolved_bindings else "unlinked"
        elif consistency_status == "stale":
            binding_status = "stale"
        else:
            binding_status = "partial" if resolved_bindings else "unlinked"
        projection_result = {
            "projection": payload.get("projection", {}),
            "resolved_bindings": resolved_bindings,
            "binding_status": binding_status,
            "binding_issues": issues,
        }
        return {
            **payload,
            "projection_result": projection_result,
            "resolved_bindings": resolved_bindings,
            "binding_status": binding_status,
            "binding_issues": issues,
        }

    @staticmethod
    def _normalize_binding(target: Dict[str, Any]) -> Dict[str, Any]:
        target_type = str(target.get("target_type") or "")
        target_name = str(target.get("target_name") or "")
        binding: Dict[str, Any] = {
            "target_type": target_type,
            "target_name": target_name,
            "status": "linked",
            "match_reason": target.get("match_reason"),
        }
        if target_type == "measure":
            measure_ref = str(target.get("measure_ref") or target_name)
            cube_name, _, measure_name = measure_ref.partition(".")
            binding.update(
                {
                    "measure_ref": measure_ref,
                    "cube_name": str(target.get("cube_name") or cube_name),
                    "measure_name": str(target.get("measure_name") or measure_name),
                }
            )
        elif target_type == "cube":
            binding["cube_name"] = target_name
        elif target_type == "join_path":
            binding.update(
                {
                    "join_path": target.get("join_path"),
                    "source_cube": target.get("source_cube"),
                    "target_cube": target.get("target_cube"),
                }
            )
        elif target_type == "event_cube":
            binding["cube_name"] = target_name
        return binding

    @staticmethod
    def _match_score(primary_name: str, title: str, aliases: Iterable[str], candidates: Iterable[str]) -> int:
        needles = {_normalize(primary_name), _normalize(title), *[_normalize(alias) for alias in aliases if alias]}
        haystacks = [_normalize(candidate) for candidate in candidates if candidate]
        best = 0
        for needle in needles:
            if not needle:
                continue
            for haystack in haystacks:
                if needle == haystack:
                    best = max(best, 100)
                elif needle in haystack or haystack in needle:
                    best = max(best, 60)
        return best
