"""最小语义路由与计划预览服务。"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Tuple

from app.application.data_agent.answerability import (
    ANSWERABLE,
    assess_from_intent,
    non_additive_aggregation_verdict,
)
from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.intent_understanding import add_candidates, ground_terms
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

    _OFFICIAL_MODE = "official"
    _PREVIEW_MODE = "preview"
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
        runtime_snapshot_service=None,
        policy_guard_service=None,
        intent_extraction_service=None,
    ):
        self._object_repository = object_repository
        self._metric_repository = metric_repository
        self._glossary_repository = glossary_repository
        self._relation_repository = relation_repository
        self._action_repository = action_repository
        self._mapper_preview_service = mapper_preview_service
        self._compiler_preview_service = compiler_preview_service
        self._runtime_service = runtime_service
        self._runtime_snapshot_service = runtime_snapshot_service
        self._policy_guard_service = policy_guard_service
        self._intent_extraction_service = intent_extraction_service

    def _expand_question(self, question: str) -> str:
        """附加式 LLM 意图抽取：把规范术语拼到匹配文本，增强口语匹配。

        无 LLM / 抽取为空时原样返回，确定性匹配行为不变（零回归）。
        仅用于实体匹配，semantic_plan_id 与展示仍用原始 question。
        """
        if self._intent_extraction_service is None or not hasattr(self._intent_extraction_service, "extract_terms"):
            return question
        terms = self._intent_extraction_service.extract_terms(question)
        if not terms:
            return question
        return question + " " + " ".join(terms)

    def _understand(
        self,
        question: str,
        *,
        runtime_mode: str | None,
        runtime_manifest: dict[str, Any] | None,
        runtime_catalog: RuntimeSemanticCatalog | None,
        semantic_plan_id: str | None,
        principal_context: dict[str, Any] | None,
    ) -> Dict[str, Any]:
        """L1 结构化意图理解 + grounding（Phase 8.2）。

        - 新结构化 service（有 extract_intent）且 available → LLM 抽意图 → grounding 到已发布候选
          → 把命中的规范名拼进 match_text（既有 _match_* 据此命中），并带回 intent_type/confidence。
        - 旧词袋 service（extract_terms）→ 回退 _expand_question（向后兼容既有注入/测试）。
        - 未启用 / 无 service / 抽取失败 → match_text=question（行为=今天，零回归）。
        """
        default = {"match_text": question, "intent_type": None, "confidence": 0.0, "grounded": [], "candidates": []}
        service = self._intent_extraction_service
        if service is None:
            return default

        if hasattr(service, "extract_intent"):
            if not getattr(service, "available", False):
                return default
            vocab, candidate_keys = self._candidate_vocabulary(
                runtime_mode=runtime_mode, runtime_manifest=runtime_manifest, runtime_catalog=runtime_catalog
            )
            principal_id = (principal_context or {}).get("principal_id")
            intent = service.extract_intent(
                question, candidate_assets=candidate_keys, principal_id=principal_id, plan_id=semantic_plan_id
            )
            if intent is None:
                return default
            grounded = ground_terms(intent.all_terms(), vocab)
            match_text = question + " " + " ".join(grounded) if grounded else question
            # 分析型 Data Agent 层 MVP（Phase 8.4）：顺带算可回答性门控（零额外 LLM，复用已有 intent+vocab+catalog）。
            # 域内但所需维度未建→out_of_coverage 诚实告知缺口；根本不在语义层→out_of_scope。挂 business_intent 供兜底用。
            dim_labels, dim_vocab = self._published_dimension_info(runtime_catalog)
            verdict = assess_from_intent(
                intent,
                asset_vocab=vocab,
                published_dimensions=dim_labels,
                dimension_vocab=dim_vocab,
            )
            return {
                "match_text": match_text,
                "intent_type": intent.intent_type,
                "confidence": intent.confidence,
                "grounded": grounded,
                "candidates": candidate_keys[:20],
                "answerability": {
                    "state": verdict.state,
                    "message": verdict.message,
                    "missing_dimensions": verdict.missing_dimensions,
                    "available_alternatives": verdict.available_alternatives,
                },
            }

        # 向后兼容：旧词袋 service
        if hasattr(service, "extract_terms"):
            return {**default, "match_text": self._expand_question(question)}
        return default

    def _candidate_vocabulary(
        self,
        *,
        runtime_mode: str | None,
        runtime_manifest: dict[str, Any] | None,
        runtime_catalog: RuntimeSemanticCatalog | None,
    ) -> Tuple[Dict[str, str], List[str]]:
        """从已发布候选（active manifest 过滤后）建 grounding 白名单词表 + 候选名列表。"""
        vocab: Dict[str, str] = {}
        keys: List[str] = []

        def _named(entities, *, primary: str, title: str = "title", aliases: str = "aliases"):
            for ent in entities:
                p = getattr(ent, primary, None)
                add_candidates(vocab, p, getattr(ent, title, None), *(getattr(ent, aliases, None) or []))
                if p:
                    keys.append(str(p))

        common = dict(runtime_mode=runtime_mode, runtime_manifest=runtime_manifest, runtime_catalog=runtime_catalog)
        _named(self._runtime_entities(self._metric_repository.list_all(), entity_type="metric", **common), primary="name")
        _named(self._runtime_entities(self._object_repository.list_all(), entity_type="object", **common), primary="name")
        _named(self._runtime_entities(self._relation_repository.list_all(), entity_type="relation", **common), primary="name")
        _named(self._runtime_entities(self._action_repository.list_all(), entity_type="action", **common), primary="name")
        for g in self._runtime_entities(self._glossary_repository.list_all(), entity_type="glossary", **common):
            add_candidates(
                vocab,
                getattr(g, "term", None),
                getattr(g, "canonical_name", None),
                *(getattr(g, "aliases", None) or []),
            )
            term = getattr(g, "term", None) or getattr(g, "canonical_name", None)
            if term:
                keys.append(str(term))

        # 去重保序
        seen = set()
        uniq_keys = [k for k in keys if not (k in seen or seen.add(k))]
        return vocab, uniq_keys

    @staticmethod
    def _published_dimension_info(
        runtime_catalog: RuntimeSemanticCatalog | None,
    ) -> Tuple[List[str], Dict[str, str]]:
        """已发布 cube 维度：(人类可读标签列表, grounding 词表)。

        - labels：title 优先，供"可答粒度"诚实告知文案；
        - vocab：normalize(label/name/synonym) -> label，让中文维度词能命中（真实 cube title 多为英文，
          须靠 synonyms 才能 ground，否则任意中文维度词都被误判为覆盖缺口）。
        防御性：catalog 无 cube_repository（如测试桩）/异常 → 返回 ([], {})。
        """
        repo = getattr(runtime_catalog, "cube_repository", None)
        if repo is None:
            return [], {}
        try:
            cubes = repo.list_all()
        except Exception:
            return [], {}
        labels: List[str] = []
        vocab: Dict[str, str] = {}
        seen = set()
        for cube in cubes:
            for name, dd in (getattr(cube, "dimensions", {}) or {}).items():
                label = str(getattr(dd, "title", None) or name).strip()
                # 备选粒度只列有中文标签的业务维度（避免把自动生成的英文技术维度当建议噪声）；
                # grounding 词表 vocab 仍纳入全部 label/name/synonym（命中判定不受影响）。
                if label and label not in seen and re.search(r"[一-鿿]", label):
                    seen.add(label)
                    labels.append(label)
                for token in (label, name, *(getattr(dd, "synonyms", None) or [])):
                    nt = _normalize(str(token or ""))
                    if nt:
                        vocab.setdefault(nt, label)
        return labels, vocab

    def route(
        self,
        *,
        question: str,
        viewer_roles: list[str] | None = None,
        principal_context: dict[str, Any] | None = None,
        runtime_mode: str | None = None,
    ) -> Dict[str, Any]:
        question = (question or "").strip()
        if not question:
            raise ValueError("问题不能为空")
        runtime_mode = self._normalize_runtime_mode(runtime_mode)
        semantic_plan_id = self._build_semantic_plan_id(question)
        runtime_manifest = self._load_runtime_manifest(runtime_mode)
        if runtime_manifest is not None and not runtime_manifest.get("ok"):
            return self._blocked_runtime_route(
                question=question,
                semantic_plan_id=semantic_plan_id,
                runtime_mode=runtime_mode,
                runtime_manifest=runtime_manifest,
            )
        runtime_catalog = self._runtime_catalog(runtime_mode=runtime_mode, runtime_manifest=runtime_manifest)
        mapper_preview_service = self._mapper_preview_service_for(runtime_catalog)
        viewer_roles = self._resolve_roles(viewer_roles=viewer_roles, principal_context=principal_context)
        expansion = self._understand(
            question,
            runtime_mode=runtime_mode,
            runtime_manifest=runtime_manifest,
            runtime_catalog=runtime_catalog,
            semantic_plan_id=semantic_plan_id,
            principal_context=principal_context,
        )
        match_text = expansion["match_text"]

        matched_metric, metric_match_source = self._match_metric(
            match_text,
            runtime_mode=runtime_mode,
            runtime_manifest=runtime_manifest,
            runtime_catalog=runtime_catalog,
        )
        matched_object, object_match_source = self._match_object(
            match_text,
            runtime_mode=runtime_mode,
            runtime_manifest=runtime_manifest,
            runtime_catalog=runtime_catalog,
        )
        matched_relation, relation_match_source = self._match_relation(
            match_text,
            runtime_mode=runtime_mode,
            runtime_manifest=runtime_manifest,
            runtime_catalog=runtime_catalog,
        )
        matched_action, action_match_source = self._match_action(
            match_text,
            runtime_mode=runtime_mode,
            runtime_manifest=runtime_manifest,
            runtime_catalog=runtime_catalog,
        )
        _intent_hint = expansion.get("intent_type")
        wants_knowledge = any(keyword in question for keyword in self._KNOWLEDGE_KEYWORDS) or _intent_hint == "knowledge"
        wants_analysis = any(keyword in question for keyword in self._ANALYSIS_KEYWORDS) or _intent_hint == "analysis"
        wants_tool = any(keyword in question for keyword in self._TOOL_KEYWORDS) or _intent_hint == "tool"
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
            reason = "未命中已发布业务语义" if runtime_mode == self._OFFICIAL_MODE else "未命中可路由的业务指标或对象"
            projection_result = self._empty_projection_result()
            return {
                "semantic_plan_id": semantic_plan_id,
                "question": question,
                "runtime_mode": runtime_mode,
                "route_type": "blocked",
                "planning_mode": "single_step",
                "targets": [],
                "matched": {},
                "primary_match": {},
                "matched_entities": [],
                "business_intent": {
                    "route_type": "blocked",
                    "targets": [],
                    "matched_entities": [],
                    "primary_match": {},
                },
                "projection_result": projection_result,
                "resolved_bindings": [],
                "execution_preview": None,
                "traceability": {
                    "semantic_plan_id": semantic_plan_id,
                    "question": question,
                    "runtime": {"mode": runtime_mode},
                    "ontology": {},
                    "analysis": {},
                },
                "reason": reason,
            }

        primary_entity = matched_entities[0]
        execution_preview: Dict[str, Any] | None = None
        projection_preview: Dict[str, Any] | None = None
        policy: Dict[str, Any] | None = None
        target_flags = {"knowledge": False, "cube": False, "tool": False}
        reason: Optional[str] = None
        # 非可加指标按维度聚合被 compiler 守卫挡下时，存其 label，供后续协调 answerability + 友好 reason。
        non_additive_block_label: Optional[str] = None
        analysis_intent = self._extract_analysis_intent(question=question, matched_metric=matched_metric)

        if matched_metric is not None:
            if projection_preview is None and primary_entity["entity_type"] == "metric":
                projection_preview = mapper_preview_service.preview(entity_type="metric", entity_name=matched_metric.name)
            execution_preview = self._compiler_preview_service.compile_metric_preview(
                matched_metric.name,
                analysis_intent=analysis_intent,
                viewer_roles=viewer_roles,
                principal_context=principal_context,
                runtime_mode=runtime_mode,
                runtime_manifest=runtime_manifest,
            )
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
                # 非可加指标按维度聚合被 compiler 守卫挡下（聚合数学正确、不放开）：
                # 标记以便后续把 answerability 从 answerable 降级为 unsupported_aggregation，
                # 并用 actionable 中文替换冒泡的英文编译错误串，消除"answerable+blocked"自相矛盾。
                if (
                    policy.get("status") != "blocked"
                    and execution_preview.get("status") == "blocked"
                    and "non_additive" in str(execution_preview.get("reason") or "")
                ):
                    non_additive_block_label = matched_metric.title or matched_metric.name

        if matched_relation is not None:
            relation_projection = mapper_preview_service.preview(entity_type="relation", entity_name=matched_relation.name)
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
            action_projection = mapper_preview_service.preview(entity_type="action", entity_name=matched_action.name)
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
            object_projection = mapper_preview_service.preview(entity_type="object", entity_name=effective_matched_object.name)
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
            "semantic_plan_id": semantic_plan_id,
            "question": question,
            "runtime": {
                "mode": runtime_mode,
                **self._runtime_trace(runtime_manifest),
            },
            "principal": {
                "principal_id": (principal_context or {}).get("principal_id"),
                "roles": viewer_roles,
            },
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
            analysis_intent=analysis_intent,
        )
        projection_result = self._projection_result_from_preview(projection_preview)
        answerability = expansion.get("answerability")
        # 非可加指标按维度聚合：compiler 守卫已挡（blocked），但 answerability 只看维度发布会误判 answerable。
        # 在此协调，消除"answerable+blocked"自相矛盾：把 answerability 降级为 unsupported_aggregation，
        # 并把顶层 reason 从英文编译错误串替换为 actionable 中文。仅 non_additive 这一类做友好化，
        # 加性指标 / 维度未 ground 等其它 blocked 情形行为不变。
        if non_additive_block_label is not None:
            verdict = non_additive_aggregation_verdict(non_additive_block_label)
            # 只覆盖 None / answerable（避免抹掉 out_of_coverage 等已正确的更高优先级状态；
            # non_additive 场景维度本已 ground，原状态本就是 answerable 或 L1 关时的 None）。
            if not answerability or answerability.get("state") == ANSWERABLE:
                answerability = {
                    "state": verdict.state,
                    "message": verdict.message,
                    "missing_dimensions": [],
                    "available_alternatives": [],
                }
                # reason 友好化只在「确把 answerability 降级为 unsupported_aggregation」时做：
                # 若 answerability 被保留为 out_of_coverage 等更高优先级状态（如又请求未建维度），
                # 顶层 reason 不应被非可加文案覆盖——否则 answerability.message 说"缺 X 维度"、
                # reason 说"指标非可加"，同一返回自相矛盾。把赋值移进守卫内消除这一冲突。
                reason = verdict.message
        business_intent = {
            "route_type": route_type,
            "targets": targets,
            "matched_entities": matched_entities,
            "primary_match": primary_entity,
            "analysis_intent": analysis_intent,
            "intent_understanding": {
                "confidence": expansion.get("confidence", 0.0),
                "grounded": expansion.get("grounded", []),
                "candidates": expansion.get("candidates", []),
            },
            # 分析型 Data Agent 层（8.4）：可回答性门控判定，L1 关时为 None（不影响行为）。
            "answerability": answerability,
        }

        return {
            "semantic_plan_id": semantic_plan_id,
            "question": question,
            "runtime_mode": runtime_mode,
            "route_type": route_type,
            "planning_mode": "multi_step" if len(targets) > 1 or len(matched_entities) > 1 else "single_step",
            "targets": targets,
            "execution_targets": execution_targets,
            "matched": matched_payload,
            "primary_match": primary_entity,
            "matched_entities": matched_entities,
            "business_intent": business_intent,
            "projection_preview": projection_preview,
            "projection_result": projection_result,
            "resolved_bindings": projection_result.get("resolved_bindings", []),
            "execution_preview": execution_preview,
            "policy": policy,
            "traceability": traceability,
            "reason": reason,
        }

    def plan(
        self,
        *,
        question: str,
        viewer_roles: list[str] | None = None,
        principal_context: dict[str, Any] | None = None,
        runtime_mode: str | None = None,
    ) -> Dict[str, Any]:
        route = self.route(
            question=question,
            viewer_roles=viewer_roles,
            principal_context=principal_context,
            runtime_mode=runtime_mode,
        )
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
            "semantic_plan_id": route.get("semantic_plan_id"),
            "question": question,
            "runtime_mode": route.get("runtime_mode"),
            "business_intent": route.get("business_intent", {}),
            "projection_result": route.get("projection_result", self._empty_projection_result()),
            "resolved_bindings": route.get("resolved_bindings", []),
            "planning_mode": route.get("planning_mode", "single_step"),
            "route": route,
            "dependencies": dependencies,
            "expected_outputs": expected_outputs,
            "execution_targets": route.get("execution_targets", []),
            "steps": steps,
            "traceability": route["traceability"],
        }

    def execute_plan_preview(
        self,
        *,
        question: str,
        viewer_roles: list[str] | None = None,
        principal_context: dict[str, Any] | None = None,
        runtime_mode: str | None = None,
    ) -> Dict[str, Any]:
        plan = self.plan(
            question=question,
            viewer_roles=viewer_roles,
            principal_context=principal_context,
            runtime_mode=runtime_mode,
        )
        normalized_runtime_mode = self._normalize_runtime_mode(runtime_mode)
        runtime_manifest = self._load_runtime_manifest(normalized_runtime_mode)
        viewer_roles = self._resolve_roles(viewer_roles=viewer_roles, principal_context=principal_context)
        compiled_targets: List[Dict[str, Any]] = []
        for target in plan.get("execution_targets", []):
            preview = self._compiler_preview_service.compile_preview(
                target_type=str(target.get("target_type") or ""),
                metric_name=target.get("metric_name"),
                retrieval_query=target.get("retrieval_query"),
                retrieval_sources=target.get("retrieval_sources"),
                tool_name=target.get("tool_name"),
                tool_arguments=target.get("tool_arguments"),
                analysis_intent=target.get("analysis_intent"),
                query_dsl=target.get("query_dsl"),
                viewer_roles=viewer_roles or [],
                principal_context=principal_context,
                runtime_mode=normalized_runtime_mode,
                runtime_manifest=runtime_manifest,
            )
            compiled_targets.append(
                {
                    "target": target,
                    "preview": preview,
                }
            )
        return {
            "semantic_plan_id": plan.get("semantic_plan_id"),
            "question": question,
            "runtime_mode": plan.get("runtime_mode"),
            "business_intent": plan.get("business_intent", {}),
            "projection_result": plan.get("projection_result", self._empty_projection_result()),
            "resolved_bindings": plan.get("resolved_bindings", []),
            "planning_mode": plan.get("planning_mode", "single_step"),
            "route": plan.get("route", {}),
            "dependencies": plan.get("dependencies", []),
            "expected_outputs": plan.get("expected_outputs", []),
            "execution_targets": plan.get("execution_targets", []),
            "compiled_targets": compiled_targets,
            "steps": plan.get("steps", []),
            "traceability": plan.get("traceability", {}),
        }

    def execute_plan(
        self,
        *,
        question: str,
        viewer_roles: list[str] | None = None,
        principal_context: dict[str, Any] | None = None,
        runtime_options: dict[str, Any] | None = None,
        runtime_mode: str | None = None,
    ) -> Dict[str, Any]:
        if self._runtime_service is None:
            raise ValueError("未配置语义执行运行时")
        plan = self.plan(
            question=question,
            viewer_roles=viewer_roles,
            principal_context=principal_context,
            runtime_mode=runtime_mode,
        )
        normalized_runtime_mode = self._normalize_runtime_mode(runtime_mode)
        runtime_manifest = self._load_runtime_manifest(normalized_runtime_mode)
        viewer_roles = self._resolve_roles(viewer_roles=viewer_roles, principal_context=principal_context)
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
                    analysis_intent=target.get("analysis_intent"),
                    viewer_roles=viewer_roles or [],
                    principal_context=principal_context,
                    route_type=plan.get("route", {}).get("route_type"),
                    approval_id=(runtime_options or {}).get("approval_id"),
                    semantic_plan_id=plan.get("semantic_plan_id"),
                    runtime_mode=normalized_runtime_mode,
                    runtime_manifest=runtime_manifest,
                )
            )
        return {
            "semantic_plan_id": plan.get("semantic_plan_id"),
            "question": question,
            "runtime_mode": plan.get("runtime_mode"),
            "business_intent": plan.get("business_intent", {}),
            "projection_result": plan.get("projection_result", self._empty_projection_result()),
            "resolved_bindings": plan.get("resolved_bindings", []),
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

    @staticmethod
    def _build_semantic_plan_id(question: str) -> str:
        digest = hashlib.sha256(question.encode("utf-8")).hexdigest()[:16]
        return f"sp_{digest}"

    @classmethod
    def _normalize_runtime_mode(cls, runtime_mode: str | None) -> str:
        return cls._OFFICIAL_MODE if runtime_mode == cls._OFFICIAL_MODE else cls._PREVIEW_MODE

    @classmethod
    def _runtime_visible(cls, entity: Any, runtime_mode: str) -> bool:
        if runtime_mode != cls._OFFICIAL_MODE:
            return True
        return str(getattr(entity, "status", "active") or "") == "active"

    @classmethod
    def _runtime_entities(
        cls,
        entities: List[Any],
        runtime_mode: str,
        *,
        runtime_manifest: dict[str, Any] | None = None,
        entity_type: str | None = None,
        runtime_catalog: RuntimeSemanticCatalog | None = None,
    ) -> List[Any]:
        if runtime_mode == cls._OFFICIAL_MODE and runtime_catalog is not None and entity_type is not None:
            return runtime_catalog.list_entities(entity_type)
        visible = [entity for entity in entities if cls._runtime_visible(entity, runtime_mode)]
        if runtime_mode != cls._OFFICIAL_MODE or runtime_manifest is None or entity_type is None:
            return visible
        return [
            entity
            for entity in visible
            if cls._runtime_manifest_allows(
                runtime_manifest=runtime_manifest,
                entity_type=entity_type,
                entity=entity,
            )
        ]

    def _load_runtime_manifest(self, runtime_mode: str) -> dict[str, Any] | None:
        if runtime_mode != self._OFFICIAL_MODE or self._runtime_snapshot_service is None:
            return None
        return self._runtime_snapshot_service.get_active_manifest("default")

    def _runtime_catalog(
        self,
        *,
        runtime_mode: str,
        runtime_manifest: dict[str, Any] | None,
    ) -> RuntimeSemanticCatalog | None:
        if runtime_mode != self._OFFICIAL_MODE or not runtime_manifest or not runtime_manifest.get("ok"):
            return None
        return RuntimeSemanticCatalog.from_manifest(runtime_manifest)

    def _mapper_preview_service_for(self, runtime_catalog: RuntimeSemanticCatalog | None):
        if runtime_catalog is None:
            return self._mapper_preview_service
        return SemanticMapperPreviewService(
            object_repository=runtime_catalog.object_repository,
            metric_repository=runtime_catalog.metric_repository,
            glossary_repository=runtime_catalog.glossary_repository,
            relation_repository=runtime_catalog.relation_repository,
            action_repository=runtime_catalog.action_repository,
            cube_repository=runtime_catalog.cube_repository,
        )

    @classmethod
    def _runtime_manifest_allows(
        cls,
        *,
        runtime_manifest: dict[str, Any],
        entity_type: str,
        entity: Any,
    ) -> bool:
        asset_manifest = runtime_manifest.get("asset_manifest_json") or {}
        assets = asset_manifest.get("assets") or []
        if not assets:
            return False
        name = str(getattr(entity, "name", "") or getattr(entity, "canonical_name", "") or "").strip()
        term = str(getattr(entity, "term", "") or "").strip()
        entry_type = str(getattr(entity, "entry_type", "") or entity_type).strip()
        candidates = {item for item in (name, term) if item}
        candidates.update({f"{entity_type}:{item}" for item in list(candidates)})
        if name and entry_type:
            candidates.add(f"{entry_type}:{name}")
        if term and entry_type:
            candidates.add(f"{entry_type}:{term}")
        for asset in assets:
            asset_key = str(asset.get("asset_key") or "").strip()
            if asset_key in candidates:
                return True
            if any(candidate and asset_key.endswith(f":{candidate}") for candidate in candidates):
                return True
        return False

    @staticmethod
    def _runtime_trace(runtime_manifest: dict[str, Any] | None) -> Dict[str, Any]:
        if runtime_manifest is None:
            return {}
        version_pin = runtime_manifest.get("version_pin") or {}
        trace = {
            "snapshot_id": runtime_manifest.get("snapshot_id"),
            "release_id": runtime_manifest.get("release_id"),
            "release_no": version_pin.get("release_no"),
            "manifest_status": "ready" if runtime_manifest.get("ok") else "blocked",
            "error_code": runtime_manifest.get("error_code"),
        }
        if version_pin:
            trace["version_pin"] = version_pin
        if runtime_manifest.get("asset_trace") is not None:
            trace["assets"] = runtime_manifest.get("asset_trace")
        if runtime_manifest.get("binding_trace") is not None:
            trace["bindings"] = runtime_manifest.get("binding_trace")
        if runtime_manifest.get("policy_trace") is not None:
            trace["policies"] = runtime_manifest.get("policy_trace")
        return trace

    def _blocked_runtime_route(
        self,
        *,
        question: str,
        semantic_plan_id: str,
        runtime_mode: str,
        runtime_manifest: dict[str, Any],
    ) -> Dict[str, Any]:
        projection_result = self._empty_projection_result()
        return {
            "semantic_plan_id": semantic_plan_id,
            "question": question,
            "runtime_mode": runtime_mode,
            "route_type": "blocked",
            "planning_mode": "single_step",
            "targets": [],
            "matched": {},
            "primary_match": {},
            "matched_entities": [],
            "business_intent": {
                "route_type": "blocked",
                "targets": [],
                "matched_entities": [],
                "primary_match": {},
            },
            "projection_result": projection_result,
            "resolved_bindings": [],
            "execution_preview": None,
            "traceability": {
                "semantic_plan_id": semantic_plan_id,
                "question": question,
                "runtime": {
                    "mode": runtime_mode,
                    **self._runtime_trace(runtime_manifest),
                },
                "ontology": {},
                "analysis": {},
            },
            "reason": runtime_manifest.get("error_code") or "semantic_runtime_not_ready",
        }

    @staticmethod
    def _empty_projection_result() -> Dict[str, Any]:
        return {
            "projection": {"targets": []},
            "resolved_bindings": [],
            "binding_status": "unlinked",
            "binding_issues": [],
        }

    def _projection_result_from_preview(self, projection_preview: Dict[str, Any] | None) -> Dict[str, Any]:
        if not projection_preview:
            return self._empty_projection_result()
        return projection_preview.get("projection_result") or {
            "projection": projection_preview.get("projection", {"targets": []}),
            "resolved_bindings": projection_preview.get("resolved_bindings", []),
            "binding_status": projection_preview.get("binding_status", "unlinked"),
            "binding_issues": projection_preview.get("binding_issues", []),
        }

    @staticmethod
    def _resolve_roles(
        *,
        viewer_roles: list[str] | None,
        principal_context: dict[str, Any] | None,
    ) -> list[str]:
        roles: list[str] = []
        for role in (principal_context or {}).get("roles") or []:
            item = str(role or "").strip()
            if item and item not in roles:
                roles.append(item)
        for role in viewer_roles or []:
            item = str(role or "").strip()
            if item and item not in roles:
                roles.append(item)
        return roles

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
        analysis_intent: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        analysis_intent = analysis_intent or {}
        execution_targets: List[Dict[str, Any]] = []
        if "cube" in targets and matched_metric is not None:
            execution_targets.append(
                {
                    "target_key": f"metric:{matched_metric.name}:sql",
                    "target_type": "sql",
                    "metric_name": matched_metric.name,
                    "analysis_intent": analysis_intent,
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

    @staticmethod
    def _extract_analysis_intent(*, question: str, matched_metric: Optional[BusinessMetric]) -> Dict[str, Any]:
        intent: Dict[str, Any] = {
            "dimension_terms": [],
            "filters": [],
            "segments": [],
        }
        dimension_terms: list[str] = []
        for pattern in (r"按(.+?)(?:汇总|统计|分组|分布|排行|排名)", r"各(.+?)(?:的|学生|评论|数量|数|情况)"):
            for match in re.finditer(pattern, question):
                term = match.group(1).strip()
                term = re.sub(r"^(个|每个)", "", term)
                if term and term not in dimension_terms:
                    dimension_terms.append(term)
        if "学校" in question and not any("学校" in term for term in dimension_terms):
            dimension_terms.append("学校")
        if dimension_terms:
            intent["dimension_terms"] = dimension_terms

        recent_days = re.search(r"最近\s*(\d+)\s*天", question)
        if recent_days:
            intent["time_window"] = {
                "type": "last_n_days",
                "n": int(recent_days.group(1)),
            }

        if matched_metric is not None and (dimension_terms or any(token in question for token in ("排行", "排名", "top", "Top", "TOP"))):
            intent["order_by"] = [
                {
                    "term": matched_metric.title or matched_metric.name,
                    "direction": "desc",
                }
            ]
            intent["limit"] = 100
        return intent

    def _match_metric(
        self,
        question: str,
        runtime_mode: str | None = None,
        runtime_manifest: dict[str, Any] | None = None,
        runtime_catalog: RuntimeSemanticCatalog | None = None,
    ) -> Tuple[Optional[BusinessMetric], Optional[str]]:
        runtime_mode = self._normalize_runtime_mode(runtime_mode)
        normalized_question = _normalize(question)
        for metric in self._runtime_entities(
            self._metric_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="metric",
            runtime_catalog=runtime_catalog,
        ):
            candidates = [metric.name, metric.title, *metric.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return metric, "metric"

        for glossary in self._runtime_entities(
            self._glossary_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="glossary",
            runtime_catalog=runtime_catalog,
        ):
            if glossary.entry_type != "metric":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            metric = (
                runtime_catalog.get_metric(glossary.canonical_name)
                if runtime_catalog is not None
                else self._metric_repository.get(glossary.canonical_name)
            )
            if metric is not None and self._runtime_visible(metric, runtime_mode):
                return metric, "glossary"

        return None, None

    def _match_object(
        self,
        question: str,
        runtime_mode: str | None = None,
        runtime_manifest: dict[str, Any] | None = None,
        runtime_catalog: RuntimeSemanticCatalog | None = None,
    ) -> Tuple[Optional[BusinessObject], Optional[str]]:
        runtime_mode = self._normalize_runtime_mode(runtime_mode)
        normalized_question = _normalize(question)
        for obj in self._runtime_entities(
            self._object_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="object",
            runtime_catalog=runtime_catalog,
        ):
            candidates = [obj.name, obj.title, *obj.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return obj, "object"

        for glossary in self._runtime_entities(
            self._glossary_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="glossary",
            runtime_catalog=runtime_catalog,
        ):
            if glossary.entry_type != "object":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            obj = (
                runtime_catalog.get_object(glossary.canonical_name)
                if runtime_catalog is not None
                else self._object_repository.get(glossary.canonical_name)
            )
            if obj is not None and self._runtime_visible(obj, runtime_mode):
                return obj, "glossary"

        return None, None

    def _match_relation(
        self,
        question: str,
        runtime_mode: str | None = None,
        runtime_manifest: dict[str, Any] | None = None,
        runtime_catalog: RuntimeSemanticCatalog | None = None,
    ) -> Tuple[Optional[BusinessRelation], Optional[str]]:
        runtime_mode = self._normalize_runtime_mode(runtime_mode)
        normalized_question = _normalize(question)
        for relation in self._runtime_entities(
            self._relation_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="relation",
            runtime_catalog=runtime_catalog,
        ):
            candidates = [relation.name, relation.title, *relation.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return relation, "relation"

        for glossary in self._runtime_entities(
            self._glossary_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="glossary",
            runtime_catalog=runtime_catalog,
        ):
            if glossary.entry_type != "relation":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            relation = (
                runtime_catalog.get_relation(glossary.canonical_name)
                if runtime_catalog is not None
                else self._relation_repository.get(glossary.canonical_name)
            )
            if relation is not None and self._runtime_visible(relation, runtime_mode):
                return relation, "glossary"

        return None, None

    def _match_action(
        self,
        question: str,
        runtime_mode: str | None = None,
        runtime_manifest: dict[str, Any] | None = None,
        runtime_catalog: RuntimeSemanticCatalog | None = None,
    ) -> Tuple[Optional[BusinessAction], Optional[str]]:
        runtime_mode = self._normalize_runtime_mode(runtime_mode)
        normalized_question = _normalize(question)
        for action in self._runtime_entities(
            self._action_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="action",
            runtime_catalog=runtime_catalog,
        ):
            candidates = [action.name, action.title, *action.aliases]
            if any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                return action, "action"

        for glossary in self._runtime_entities(
            self._glossary_repository.list_all(),
            runtime_mode,
            runtime_manifest=runtime_manifest,
            entity_type="glossary",
            runtime_catalog=runtime_catalog,
        ):
            if glossary.entry_type != "action":
                continue
            candidates = [glossary.term, glossary.canonical_name, *glossary.aliases]
            if not any(_normalize(candidate) and _normalize(candidate) in normalized_question for candidate in candidates):
                continue
            action = (
                runtime_catalog.get_action(glossary.canonical_name)
                if runtime_catalog is not None
                else self._action_repository.get(glossary.canonical_name)
            )
            if action is not None and self._runtime_visible(action, runtime_mode):
                return action, "glossary"

        return None, None
