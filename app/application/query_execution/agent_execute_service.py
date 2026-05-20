from __future__ import annotations

from typing import Any

from app.domain.query_execution.enums import QueryRouteType
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


class AgentSemanticExecuteService:
    """Agent-first 语义执行编排：plan 通过后提交到查询执行面。"""

    def __init__(self, *, plan_handler, submission_service):
        self.plan_handler = plan_handler
        self.submission_service = submission_service

    def execute(
        self,
        *,
        question: str,
        principal_context: dict[str, Any] | None = None,
        viewer_roles: list[str] | None = None,
        runtime_options: dict[str, Any] | None = None,
        authenticated_user: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        plan = self.plan_handler.handle(
            question=question,
            principal_context=principal_context,
            viewer_roles=viewer_roles,
            runtime_options={**(runtime_options or {}), "runtime_mode": "official"},
            authenticated_user=authenticated_user,
        )
        decision = (plan.get("policy_decision") or {}).get("decision") or (plan.get("policy_decision") or {}).get("effect")
        if decision != "allow":
            logger.info(
                "agent_semantic_execute_blocked",
                metric_event="agent_semantic_execute.blocked",
                semantic_plan_id=plan.get("semantic_plan_id"),
                decision=decision,
                reason=(plan.get("policy_decision") or {}).get("reason"),
            )
            return {
                "status": "approval_required" if decision in {"approval_required", "require_approval"} else "blocked",
                "reason": (plan.get("policy_decision") or {}).get("reason"),
                "policy_decision": plan.get("policy_decision"),
                "ticket_preview": plan.get("ticket_preview"),
                "semantic_trace": plan.get("semantic_trace"),
                "plan": plan,
            }

        target = self._first_ready_sql_target(plan.get("compiled_targets") or [])
        if target is None:
            return {
                "status": "blocked",
                "reason": "没有可执行的 SQL 编译目标",
                "policy_decision": plan.get("policy_decision"),
                "semantic_trace": plan.get("semantic_trace"),
                "plan": plan,
            }
        query_dsl = target.get("query_dsl")
        if not self._is_versioned_query_dsl(query_dsl):
            return {
                "status": "blocked",
                "reason": "Agent 语义执行目标缺少可审计的 QueryDSL v1 快照",
                "policy_decision": plan.get("policy_decision"),
                "semantic_trace": plan.get("semantic_trace"),
                "plan": plan,
            }
        runtime_trace = self._runtime_trace(plan.get("semantic_trace"))
        runtime_version_pin = runtime_trace.get("version_pin")
        if not self._is_versioned_runtime_pin(runtime_version_pin):
            return {
                "status": "blocked",
                "reason": "Agent 语义执行目标缺少 Runtime version pin，无法回溯发布快照",
                "policy_decision": plan.get("policy_decision"),
                "semantic_trace": plan.get("semantic_trace"),
                "plan": plan,
            }

        execution_request = target.get("execution_request") or {}
        principal = plan.get("principal_context") or principal_context or {}
        principal_id = principal.get("principal_id") or principal.get("user_id") or "anonymous"
        submitted = self.submission_service.submit(
            principal_id=principal_id,
            source_id=int(execution_request.get("source_id")),
            sql_query=execution_request.get("sql_query") or target.get("logical_sql"),
            route_type=QueryRouteType.AGENT_SEMANTIC.value,
            semantic_plan_id=plan.get("semantic_plan_id"),
            resource_set=target.get("resource_set") or {},
            sql_hash=target.get("sql_hash"),
            data_level=target.get("data_level") or "M1",
            governance_snapshot={
                "policy_decision": plan.get("policy_decision"),
                "pre_route_policy_decision": plan.get("pre_route_policy_decision"),
                "ticket_preview": plan.get("ticket_preview"),
                "query_dsl": query_dsl,
                "semantic_trace": plan.get("semantic_trace"),
                "runtime_version_pin": runtime_version_pin,
                "runtime_assets": runtime_trace.get("assets") or [],
                "sql_hash": target.get("sql_hash"),
                "data_level": target.get("data_level") or "M1",
            },
            policy_decision=decision,
            approval_id=(runtime_options or {}).get("approval_id"),
            idempotency_key=idempotency_key,
        )
        logger.info(
            "agent_semantic_execute_submitted",
            metric_event="agent_semantic_execute.submitted",
            semantic_plan_id=plan.get("semantic_plan_id"),
            query_id=submitted.query_id,
            trace_id=submitted.trace_id,
            sql_hash=target.get("sql_hash"),
            data_level=target.get("data_level") or "M1",
            runtime_release_id=runtime_version_pin.get("release_id"),
            runtime_release_no=runtime_version_pin.get("release_no"),
            runtime_snapshot_id=runtime_version_pin.get("snapshot_id"),
        )
        return {
            **submitted.to_dict(),
            "status": "submitted",
            "semantic_trace": plan.get("semantic_trace"),
            "plan": plan,
        }

    @staticmethod
    def _first_ready_sql_target(compiled_targets: list[dict[str, Any]]) -> dict[str, Any] | None:
        for target in compiled_targets:
            if (target.get("target_type") or "").lower() == "sql" and target.get("status") == "ready":
                return target
        return None

    @staticmethod
    def _is_versioned_query_dsl(value: Any) -> bool:
        return isinstance(value, dict) and value.get("dsl_version") == "v1"

    @staticmethod
    def _runtime_trace(semantic_trace: Any) -> dict[str, Any]:
        if not isinstance(semantic_trace, dict):
            return {}
        traceability = semantic_trace.get("traceability")
        if isinstance(traceability, dict):
            runtime_trace = traceability.get("runtime")
            if isinstance(runtime_trace, dict):
                return runtime_trace
        runtime_trace = semantic_trace.get("runtime")
        return runtime_trace if isinstance(runtime_trace, dict) else {}

    @staticmethod
    def _is_versioned_runtime_pin(value: Any) -> bool:
        return (
            isinstance(value, dict)
            and bool(value.get("snapshot_id"))
            and bool(value.get("release_id"))
            and value.get("release_no") is not None
        )
