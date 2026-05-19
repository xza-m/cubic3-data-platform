"""Agent 语义规划编排处理器。"""
from __future__ import annotations

from typing import Any, Optional


class AgentPlanHandler:
    """编排 Agent 语义规划，不承载领域判断。"""

    def __init__(
        self,
        *,
        principal_resolver,
        access_policy_service,
        router_service,
        compiler_service,
    ):
        self._principal_resolver = principal_resolver
        self._access_policy_service = access_policy_service
        self._router_service = router_service
        self._compiler_service = compiler_service

    def handle(
        self,
        *,
        question: str,
        principal_context: Optional[dict[str, Any]] = None,
        viewer_roles: Optional[list[str]] = None,
        runtime_options: Optional[dict[str, Any]] = None,
        authenticated_user: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        normalized_question = (question or "").strip()
        if not normalized_question:
            raise ValueError("请求体缺少必填字段: question")
        normalized_runtime_options = dict(runtime_options or {})
        normalized_runtime_options["runtime_mode"] = "official"

        principal = self._principal_resolver.resolve(
            principal_context=principal_context,
            viewer_roles=viewer_roles,
            authenticated_user=authenticated_user,
        )
        pre_decision = self._access_policy_service.pre_route(principal=principal)
        if pre_decision.decision == "deny":
            return self._build_response(
                question=normalized_question,
                principal=principal,
                plan={},
                compiled_targets=[],
                policy_decision=pre_decision,
                pre_route_decision=pre_decision,
                runtime_options=normalized_runtime_options,
            )

        plan = self._plan_with_router(
            question=normalized_question,
            principal_context=principal.to_dict(),
            viewer_roles=principal.roles,
            runtime_mode=normalized_runtime_options["runtime_mode"],
        )
        compiled_targets = [
            self._compile_target(
                target,
                principal_context=principal.to_dict(),
                viewer_roles=principal.roles,
                runtime_mode=normalized_runtime_options["runtime_mode"],
            )
            for target in plan.get("execution_targets", [])
        ]
        post_decision = self._access_policy_service.post_compile(
            principal=principal,
            compiled_targets=compiled_targets,
            approval_id=(runtime_options or {}).get("approval_id"),
        )
        return self._build_response(
            question=normalized_question,
            principal=principal,
            plan=plan,
            compiled_targets=compiled_targets,
            policy_decision=post_decision,
            pre_route_decision=pre_decision,
            runtime_options=normalized_runtime_options,
        )

    def _compile_target(
        self,
        target: dict[str, Any],
        *,
        principal_context: dict[str, Any],
        viewer_roles: list[str],
        runtime_mode: str,
    ) -> dict[str, Any]:
        preview = self._compiler_service.compile_preview(
            target_type=str(target.get("target_type") or ""),
            metric_name=target.get("metric_name"),
            question=target.get("question"),
            retrieval_query=target.get("retrieval_query"),
            retrieval_sources=target.get("retrieval_sources"),
            tool_name=target.get("tool_name"),
            tool_arguments=target.get("tool_arguments"),
            analysis_intent=target.get("analysis_intent"),
            query_dsl=target.get("query_dsl"),
            principal_context=principal_context,
            viewer_roles=viewer_roles,
            runtime_mode=runtime_mode,
        )
        return {
            "target": target,
            **preview,
        }

    def _plan_with_router(
        self,
        *,
        question: str,
        principal_context: dict[str, Any],
        viewer_roles: list[str],
        runtime_mode: str,
    ) -> dict[str, Any]:
        try:
            return self._router_service.plan(
                question=question,
                principal_context=principal_context,
                viewer_roles=viewer_roles,
                runtime_mode=runtime_mode,
            )
        except TypeError as exc:
            if "viewer_roles" not in str(exc):
                raise
            return self._router_service.plan(
                question=question,
                principal_context=principal_context,
                runtime_mode=runtime_mode,
            )

    @staticmethod
    def _build_response(
        *,
        question: str,
        principal,
        plan: dict[str, Any],
        compiled_targets: list[dict[str, Any]],
        policy_decision,
        pre_route_decision,
        runtime_options: dict[str, Any],
    ) -> dict[str, Any]:
        route = plan.get("route", {})
        business_intent = plan.get("business_intent") or route.get("business_intent") or {
            "route_type": route.get("route_type"),
            "targets": route.get("targets", []),
            "matched_entities": route.get("matched_entities", []),
            "primary_match": route.get("primary_match", {}),
        }
        semantic_plan_id = plan.get("semantic_plan_id") or route.get("semantic_plan_id")
        runtime_mode = runtime_options.get("runtime_mode") or plan.get("runtime_mode") or route.get("runtime_mode")
        semantic_trace = {
            "semantic_plan_id": semantic_plan_id,
            "runtime_mode": runtime_mode,
            "business_intent": business_intent,
            "route": route,
            "compiled_targets": compiled_targets,
            "policy_decision": policy_decision.to_dict(),
            "traceability": plan.get("traceability", {}),
        }
        return {
            "semantic_plan_id": semantic_plan_id,
            "question": question,
            "runtime_mode": runtime_mode,
            "principal_context": principal.to_dict(),
            "business_intent": business_intent,
            "route": route,
            "planning_steps": plan.get("steps", []),
            "compiled_targets": compiled_targets,
            "projection_result": plan.get("projection_result") or route.get("projection_result"),
            "resolved_bindings": plan.get("resolved_bindings") or route.get("resolved_bindings", []),
            "policy_decision": policy_decision.to_dict(),
            "pre_route_policy_decision": pre_route_decision.to_dict(),
            "ticket_preview": policy_decision.ticket_preview,
            "traceability": plan.get("traceability", {}),
            "semantic_trace": semantic_trace,
            "runtime_options": runtime_options,
            "explain": {
                "agent_plan_handler": "应用层编排器，生成 official Runtime 规划、Binding、编译目标与治理材料",
                "ticket": "/semantic/plan 只返回 preview_only ticket；真实执行由 /semantic/execute 生成可审计查询任务",
            },
        }
