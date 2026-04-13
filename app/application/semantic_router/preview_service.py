"""最小语义路由与计划预览服务。"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.domain.ontology.entities import BusinessAction, BusinessMetric, BusinessObject, BusinessRelation
from app.domain.ontology.ports.action_repository import IBusinessActionRepository
from app.domain.ontology.ports.glossary_repository import IGlossaryRepository
from app.domain.ontology.ports.metric_repository import IBusinessMetricRepository
from app.domain.ontology.ports.object_repository import IBusinessObjectRepository
from app.domain.ontology.ports.relation_repository import IBusinessRelationRepository


def _normalize(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.lower())


class SemanticRouterPreviewService:
    """基于术语和指标做最小可解释路由。"""

    _KNOWLEDGE_KEYWORDS = ("解释", "含义", "定义", "口径", "是什么", "为何", "为什么")
    _ANALYSIS_KEYWORDS = ("查看", "查询", "统计", "趋势", "多少", "top", "分析", "对比", "汇总")
    _TOOL_KEYWORDS = ("创建", "发送", "触发", "同步", "推送", "通知", "调用", "执行")

    def __init__(
        self,
        *,
        object_repository: IBusinessObjectRepository,
        metric_repository: IBusinessMetricRepository,
        glossary_repository: IGlossaryRepository,
        relation_repository: IBusinessRelationRepository,
        action_repository: IBusinessActionRepository,
        mapper_preview_service,
        compiler_preview_service,
        runtime_service=None,
        policy_guard_service=None,
    ):
        self._object_repository = object_repository
        self._metric_repository = metric_repository
        self._glossary_repository = glossary_repository
        self._relation_repository = relation_repository
        self._action_repository = action_repository
        self._mapper_preview_service = mapper_preview_service
        self._compiler_preview_service = compiler_preview_service
        self._runtime_service = runtime_service
        self._policy_guard_service = policy_guard_service

    def route(self, *, question: str, viewer_roles: list[str] | None = None) -> Dict[str, Any]:
        question = (question or "").strip()
        if not question:
            raise ValueError("问题不能为空")
        viewer_roles = viewer_roles or []

        matched_metric, metric_match_source = self._match_metric(question)
        matched_object, object_match_source = self._match_object(question)
        matched_relation, relation_match_source = self._match_relation(question)
        matched_action, action_match_source = self._match_action(question)
        wants_knowledge = any(keyword in question for keyword in self._KNOWLEDGE_KEYWORDS)
        wants_analysis = any(keyword in question for keyword in self._ANALYSIS_KEYWORDS)
        wants_tool = any(keyword in question for keyword in self._TOOL_KEYWORDS)
        matched_entities: List[Dict[str, Any]] = []
        if matched_metric is not None:
            matched_entities.append(
                {
                    "entity_type": "metric",
                    "name": matched_metric.name,
                    "title": matched_metric.title,
                    "object_name": matched_metric.object_name,
                    "match_source": metric_match_source,
                }
            )
        if matched_relation is not None:
            matched_entities.append(
                {
                    "entity_type": "relation",
                    "name": matched_relation.name,
                    "title": matched_relation.title,
                    "source_object_name": matched_relation.source_object_name,
                    "target_object_name": matched_relation.target_object_name,
                    "match_source": relation_match_source,
                }
            )
        if matched_action is not None:
            matched_entities.append(
                {
                    "entity_type": "action",
                    "name": matched_action.name,
                    "title": matched_action.title,
                    "object_name": matched_action.object_name,
                    "match_source": action_match_source,
                }
            )
        object_is_shadow_of_relation = matched_relation is not None and matched_object is not None and matched_object.name in {
            matched_relation.source_object_name,
            matched_relation.target_object_name,
        }
        object_is_shadow_of_metric = matched_metric is not None and matched_object is not None and matched_object.name == matched_metric.object_name
        object_is_shadow_of_action = matched_action is not None and matched_object is not None and matched_object.name == matched_action.object_name
        effective_matched_object = None if any((object_is_shadow_of_relation, object_is_shadow_of_metric, object_is_shadow_of_action)) else matched_object
        if effective_matched_object is not None:
            matched_entities.append(
                {
                    "entity_type": "object",
                    "name": effective_matched_object.name,
                    "title": effective_matched_object.title,
                    "match_source": object_match_source,
                }
            )

        if not matched_entities:
            return {
                "question": question,
                "route_type": "blocked",
                "planning_mode": "single_step",
                "targets": [],
                "matched": {},
                "primary_match": {},
                "matched_entities": [],
                "execution_preview": None,
                "traceability": {
                    "question": question,
                    "ontology": {},
                    "analysis": {},
                },
                "reason": "未命中可路由的业务指标或对象",
            }

        primary_entity = matched_entities[0]
        execution_preview: Dict[str, Any] | None = None
        projection_preview: Dict[str, Any] | None = None
        policy: Dict[str, Any] | None = None
        target_flags = {"knowledge": False, "cube": False, "tool": False}
        reason: Optional[str] = None

        if matched_metric is not None:
            execution_preview = self._compiler_preview_service.compile_metric_preview(matched_metric.name, viewer_roles=viewer_roles)
            policy = self._evaluate_policy(
                target_type="metric",
                target_name=matched_metric.name,
                viewer_roles=viewer_roles,
            )
            if policy.get("status") != "blocked" and execution_preview.get("status") == "ready":
                if wants_analysis or wants_knowledge or len(matched_entities) > 1:
                    target_flags["cube"] = True
            else:
                reason = policy.get("reason") or execution_preview.get("reason")

        if matched_relation is not None:
            relation_projection = self._mapper_preview_service.preview(entity_type="relation", entity_name=matched_relation.name)
            if projection_preview is None and primary_entity["entity_type"] == "relation":
                projection_preview = relation_projection
            source_policy = self._evaluate_policy(
                target_type="object",
                target_name=matched_relation.source_object_name,
                viewer_roles=viewer_roles,
            )
            target_policy = self._evaluate_policy(
                target_type="object",
                target_name=matched_relation.target_object_name,
                viewer_roles=viewer_roles,
            )
            relation_policy = source_policy if source_policy["status"] == "blocked" else target_policy
            if policy is None and primary_entity["entity_type"] == "relation":
                policy = relation_policy
            if relation_policy["status"] != "blocked" and relation_projection.get("projection", {}).get("targets"):
                if wants_analysis or len(matched_entities) > 1:
                    target_flags["cube"] = True
            elif reason is None:
                reason = relation_policy.get("reason")

        if matched_action is not None:
            action_projection = self._mapper_preview_service.preview(entity_type="action", entity_name=matched_action.name)
            if projection_preview is None and primary_entity["entity_type"] == "action":
                projection_preview = action_projection
            action_policy = self._evaluate_policy(
                target_type="action",
                target_name=matched_action.name,
                viewer_roles=viewer_roles,
            )
            if policy is None and primary_entity["entity_type"] == "action":
                policy = action_policy
            if action_policy["status"] != "blocked":
                if wants_tool:
                    target_flags["tool"] = True
                if action_projection.get("projection", {}).get("targets") and (wants_analysis or len(matched_entities) > 1):
                    target_flags["cube"] = True
            elif reason is None:
                reason = action_policy.get("reason")

        if effective_matched_object is not None:
            object_projection = self._mapper_preview_service.preview(entity_type="object", entity_name=effective_matched_object.name)
            if projection_preview is None and primary_entity["entity_type"] == "object":
                projection_preview = object_projection
            object_policy = self._evaluate_policy(
                target_type="object",
                target_name=effective_matched_object.name,
                viewer_roles=viewer_roles,
            )
            if policy is None and primary_entity["entity_type"] == "object":
                policy = object_policy
            if object_policy["status"] != "blocked" and object_projection.get("projection", {}).get("targets"):
                if wants_analysis or len(matched_entities) > 1:
                    target_flags["cube"] = True
            elif reason is None:
                reason = object_policy.get("reason")

        if wants_knowledge or (len(matched_entities) > 1 and any(item["entity_type"] in {"metric", "relation", "object"} for item in matched_entities)):
            target_flags["knowledge"] = True

        targets = [target for target in ("knowledge", "cube", "tool") if target_flags[target]]
        if not targets:
            route_type = "blocked"
        elif len(targets) == 1:
            route_type = targets[0]
        else:
            route_type = "hybrid"

        traceability = {
            "question": question,
            "ontology": {
                "matched_entities": matched_entities,
                "primary_match": primary_entity,
            },
            "analysis": {
                "execution": execution_preview.get("traceability", {}) if execution_preview else {},
                "projection": projection_preview.get("traceability", {}) if projection_preview else {},
            },
        }

        matched_payload = self._build_legacy_match_payload(
            primary_entity=primary_entity,
            matched_metric=matched_metric,
            matched_relation=matched_relation,
            matched_action=matched_action,
            matched_object=effective_matched_object,
            metric_match_source=metric_match_source,
            relation_match_source=relation_match_source,
            action_match_source=action_match_source,
            object_match_source=object_match_source,
        )
        execution_targets = self._build_execution_targets(
            question=question,
            targets=targets,
            matched_metric=matched_metric,
            matched_action=matched_action,
            matched_object=effective_matched_object,
        )

        return {
            "question": question,
            "route_type": route_type,
            "planning_mode": "multi_step" if len(targets) > 1 or len(matched_entities) > 1 else "single_step",
            "targets": targets,
            "execution_targets": execution_targets,
            "matched": matched_payload,
            "primary_match": primary_entity,
            "matched_entities": matched_entities,
            "projection_preview": projection_preview,
            "execution_preview": execution_preview,
            "policy": policy,
            "traceability": traceability,
            "reason": reason,
        }

    def plan(self, *, question: str, viewer_roles: list[str] | None = None) -> Dict[str, Any]:
        route = self.route(question=question, viewer_roles=viewer_roles)
        steps: List[Dict[str, Any]] = [
            {
                "step_key": "semantic_match",
                "step_type": "semantic_match",
                "title": "识别业务语义",
                "status": "ready",
                "dependencies": [],
                "expected_output": "matched_entities",
                "details": {
                    "matched": route.get("matched", {}),
                    "primary_match": route.get("primary_match", {}),
                    "matched_entities": route.get("matched_entities", []),
                },
            }
        ]

        if route.get("planning_mode") == "multi_step":
            steps.append(
                {
                    "step_key": "route_decision",
                    "step_type": "route_decision",
                    "title": "规划多步语义执行路径",
                    "status": "ready",
                    "dependencies": ["semantic_match"],
                    "expected_output": "execution_targets",
                    "details": {
                        "targets": route.get("targets", []),
                        "route_type": route.get("route_type"),
                        "execution_targets": route.get("execution_targets", []),
                    },
                }
            )

        if route["route_type"] in {"cube", "hybrid", "blocked"} and route.get("matched", {}).get("metric_name"):
            steps.append(
                {
                    "step_key": "analysis_preview",
                    "step_type": "analysis_preview",
                    "title": "预览分析执行链路",
                    "status": route.get("execution_preview", {}).get("status", "blocked"),
                    "dependencies": ["semantic_match"],
                    "expected_output": "analysis_result",
                    "details": route.get("execution_preview", {}),
                }
            )

        if route["route_type"] in {"cube", "hybrid", "blocked"} and route.get("projection_preview") is not None:
            steps.append(
                {
                    "step_key": "projection_preview",
                    "step_type": "projection_preview",
                    "title": "预览分析语义投影",
                    "status": route.get("projection_preview", {}).get("consistency", {}).get("status", "warning"),
                    "dependencies": ["semantic_match"],
                    "expected_output": "projection_result",
                    "details": route.get("projection_preview", {}),
                }
            )

        if route["route_type"] in {"hybrid", "knowledge"}:
            steps.append(
                {
                    "step_key": "knowledge_explain",
                    "step_type": "knowledge_explain",
                    "title": "补充业务语义解释",
                    "status": "ready",
                    "dependencies": ["semantic_match"],
                    "expected_output": "knowledge_result",
                    "details": {
                        "mode": "ontology-glossary",
                        "matched": route.get("matched", {}),
                    },
                }
            )

        if "tool" in route.get("targets", []):
            steps.append(
                {
                    "step_key": "tool_dispatch",
                    "step_type": "tool_dispatch",
                    "title": "规划工具调用路径",
                    "status": "ready",
                    "dependencies": ["semantic_match"],
                    "expected_output": "tool_result",
                    "details": {
                        "mode": "tool",
                        "matched": route.get("matched", {}),
                    },
                }
            )

        steps.append(
            {
                "step_key": "traceability",
                "step_type": "traceability",
                "title": "保留语义与执行回溯",
                "status": "ready",
                "dependencies": [step["step_key"] for step in steps if step["step_key"] != "traceability"],
                "expected_output": "traceability",
                "details": route.get("traceability", {}),
            }
        )

        dependencies = [
            {
                "step_key": step["step_key"],
                "depends_on": step.get("dependencies", []),
            }
            for step in steps
            if step.get("dependencies")
        ]
        expected_outputs = [
            {"output_key": "matched_entities", "source_step": "semantic_match"},
            {"output_key": "execution_targets", "source_step": "route_decision" if route.get("planning_mode") == "multi_step" else "semantic_match"},
            {"output_key": "analysis_result", "source_step": "analysis_preview"},
            {"output_key": "projection_result", "source_step": "projection_preview"},
            {"output_key": "knowledge_result", "source_step": "knowledge_explain"},
            {"output_key": "tool_result", "source_step": "tool_dispatch"},
            {"output_key": "traceability", "source_step": "traceability"},
        ]

        return {
            "question": question,
            "planning_mode": route.get("planning_mode", "single_step"),
            "route": route,
            "dependencies": dependencies,
            "expected_outputs": expected_outputs,
            "execution_targets": route.get("execution_targets", []),
            "steps": steps,
            "traceability": route["traceability"],
        }

    def execute_plan_preview(self, *, question: str, viewer_roles: list[str] | None = None) -> Dict[str, Any]:
        plan = self.plan(question=question, viewer_roles=viewer_roles)
        compiled_targets: List[Dict[str, Any]] = []
        for target in plan.get("execution_targets", []):
            preview = self._compiler_preview_service.compile_preview(
                target_type=str(target.get("target_type") or ""),
                metric_name=target.get("metric_name"),
                retrieval_query=target.get("retrieval_query"),
                retrieval_sources=target.get("retrieval_sources"),
                tool_name=target.get("tool_name"),
                tool_arguments=target.get("tool_arguments"),
                viewer_roles=viewer_roles or [],
            )
            compiled_targets.append(
                {
                    "target": target,
                    "preview": preview,
                }
            )
        return {
            "question": question,
            "planning_mode": plan.get("planning_mode", "single_step"),
            "route": plan.get("route", {}),
            "dependencies": plan.get("dependencies", []),
            "expected_outputs": plan.get("expected_outputs", []),
            "execution_targets": plan.get("execution_targets", []),
            "compiled_targets": compiled_targets,
            "steps": plan.get("steps", []),
            "traceability": plan.get("traceability", {}),
        }

    def execute_plan(self, *, question: str, viewer_roles: list[str] | None = None) -> Dict[str, Any]:
        if self._runtime_service is None:
            raise ValueError("未配置语义执行运行时")
        plan = self.plan(question=question, viewer_roles=viewer_roles)
        execution_results: List[Dict[str, Any]] = []
        for target in plan.get("execution_targets", []):
            execution_results.append(
                self._runtime_service.execute(
                    target_type=str(target.get("target_type") or ""),
                    metric_name=target.get("metric_name"),
                    retrieval_query=target.get("retrieval_query"),
                    retrieval_sources=target.get("retrieval_sources"),
                    tool_name=target.get("tool_name"),
                    tool_arguments=target.get("tool_arguments"),
                    viewer_roles=viewer_roles or [],
                    route_type=plan.get("route", {}).get("route_type"),
                )
            )
        return {
            "question": question,
            "planning_mode": plan.get("planning_mode", "single_step"),
            "route": plan.get("route", {}),
            "plan": plan,
            "dependencies": plan.get("dependencies", []),
            "expected_outputs": plan.get("expected_outputs", []),
            "execution_targets": plan.get("execution_targets", []),
            "execution_results": execution_results,
            "execution_summary": {
                "total": len(execution_results),
                "executed": len([item for item in execution_results if item.get("status") == "executed"]),
                "blocked": len([item for item in execution_results if item.get("status") == "blocked"]),
                "not_configured": len([item for item in execution_results if item.get("status") == "not_configured"]),
            },
            "traceability": plan.get("traceability", {}),
        }

    def _build_legacy_match_payload(
        self,
        *,
        primary_entity: Dict[str, Any],
        matched_metric: Optional[BusinessMetric],
        matched_relation: Optional[BusinessRelation],
        matched_action: Optional[BusinessAction],
        matched_object: Optional[BusinessObject],
        metric_match_source: Optional[str],
        relation_match_source: Optional[str],
        action_match_source: Optional[str],
        object_match_source: Optional[str],
    ) -> Dict[str, Any]:
        entity_type = primary_entity.get("entity_type")
        if entity_type == "metric" and matched_metric is not None:
            return {
                "metric_name": matched_metric.name,
                "metric_title": matched_metric.title,
                "object_name": matched_metric.object_name,
                "metric_match_source": metric_match_source,
                "object_match_source": object_match_source,
            }
        if entity_type == "relation" and matched_relation is not None:
            return {
                "entity_type": "relation",
                "relation_name": matched_relation.name,
                "relation_title": matched_relation.title,
                "source_object_name": matched_relation.source_object_name,
                "target_object_name": matched_relation.target_object_name,
                "relation_match_source": relation_match_source,
            }
        if entity_type == "action" and matched_action is not None:
            return {
                "entity_type": "action",
                "action_name": matched_action.name,
                "action_title": matched_action.title,
                "object_name": matched_action.object_name,
                "action_match_source": action_match_source,
            }
        if entity_type == "object" and matched_object is not None:
            return {
                "entity_type": "object",
                "object_name": matched_object.name,
                "object_title": matched_object.title,
                "object_match_source": object_match_source,
            }
        return {}

    def _evaluate_policy(
        self,
        *,
        target_type: str,
        target_name: str,
        viewer_roles: list[str],
    ) -> Dict[str, Any]:
        if self._policy_guard_service is None:
            return {
                "status": "allow",
                "visibility": "public",
                "matched_policy": None,
                "required_roles": [],
            }
        return self._policy_guard_service.evaluate(
            target_type=target_type,
            target_name=target_name,
            viewer_roles=viewer_roles,
        )

    def _build_execution_targets(
        self,
        *,
        question: str,
        targets: List[str],
        matched_metric: Optional[BusinessMetric],
        matched_action: Optional[BusinessAction],
        matched_object: Optional[BusinessObject],
    ) -> List[Dict[str, Any]]:
        execution_targets: List[Dict[str, Any]] = []
        if "cube" in targets and matched_metric is not None:
            execution_targets.append(
                {
                    "target_key": f"metric:{matched_metric.name}:sql",
                    "target_type": "sql",
                    "metric_name": matched_metric.name,
                    "reason": "业务指标映射到可执行 Measure",
                }
            )
        if "knowledge" in targets:
            execution_targets.append(
                {
                    "target_key": f"question:{_normalize(question)}:retrieval",
                    "target_type": "retrieval",
                    "retrieval_query": question,
                    "retrieval_sources": ["knowledge-base", "ontology"],
                    "reason": "需要补充业务术语与口径解释",
                }
            )
        if "tool" in targets:
            if matched_action is not None and matched_action.event_cube_refs:
                execution_targets.append(
                    {
                        "target_key": f"action:{matched_action.name}:tool",
                        "target_type": "tool",
                        "tool_name": "describe_cube",
                        "tool_arguments": {"cube_name": matched_action.event_cube_refs[0]},
                        "reason": "基于动作关联的事件事实 Cube 提供只读工具说明",
                    }
                )
            elif matched_object is not None:
                execution_targets.append(
                    {
                        "target_type": "tool",
                        "tool_name": "search_knowledge",
                        "tool_arguments": {"query": matched_object.title or matched_object.name, "max_results": 5},
                        "reason": "对象命中后补充只读知识工具结果",
                    }
                )
            else:
                execution_targets.append(
                    {
                        "target_type": "tool",
                        "tool_name": "search_knowledge",
                        "tool_arguments": {"query": question, "max_results": 5},
                        "reason": "默认走只读知识工具",
                    }
                )
        return execution_targets

    def _match_metric(self, question: str) -> Tuple[Optional[BusinessMetric], Optional[str]]:
        normalized_question = _normalize(question)
        for metric in self._metric_repository.list_all():
            candidates = [metric.name, metric.title, *metric.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return metric, "metric"

        for glossary in self._glossary_repository.list_all():
            if glossary.entry_type != "metric":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            metric = self._metric_repository.get(glossary.canonical_name)
            if metric is not None:
                return metric, "glossary"

        return None, None

    def _match_object(self, question: str) -> Tuple[Optional[BusinessObject], Optional[str]]:
        normalized_question = _normalize(question)
        for obj in self._object_repository.list_all():
            candidates = [obj.name, obj.title, *obj.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return obj, "object"

        for glossary in self._glossary_repository.list_all():
            if glossary.entry_type != "object":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            obj = self._object_repository.get(glossary.canonical_name)
            if obj is not None:
                return obj, "glossary"

        return None, None

    def _match_relation(self, question: str) -> Tuple[Optional[BusinessRelation], Optional[str]]:
        normalized_question = _normalize(question)
        for relation in self._relation_repository.list_all():
            candidates = [relation.name, relation.title, *relation.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return relation, "relation"

        for glossary in self._glossary_repository.list_all():
            if glossary.entry_type != "relation":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            relation = self._relation_repository.get(glossary.canonical_name)
            if relation is not None:
                return relation, "glossary"

        return None, None

    def _match_action(self, question: str) -> Tuple[Optional[BusinessAction], Optional[str]]:
        normalized_question = _normalize(question)
        for action in self._action_repository.list_all():
            candidates = [action.name, action.title, *action.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return action, "action"

        for glossary in self._glossary_repository.list_all():
            if glossary.entry_type != "action":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            action = self._action_repository.get(glossary.canonical_name)
            if action is not None:
                return action, "glossary"

        return None, None
