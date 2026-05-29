"""Agent 语义执行到 dw-query-gateway 的编排服务。"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from app.application.governance.gateway_access_context import build_gateway_access_context
from app.infrastructure.gateway.telemetry_client import GatewayQueryError
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


class GatewayQueryClientProtocol(Protocol):
    def execute_sql(
        self,
        *,
        sql: str,
        access_context: dict[str, Any],
        wait_for_completion: bool = False,
        idempotency_key: str | None = None,
        runtime_options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ...


class SemanticGatewayExecuteService:
    """正式 Agent 查询执行：平台治理后提交给 dw-query-gateway。"""

    def __init__(
        self,
        *,
        plan_handler: Any,
        gateway_client_factory: Callable[[], GatewayQueryClientProtocol],
    ) -> None:
        self._plan_handler = plan_handler
        self._gateway_client_factory = gateway_client_factory

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
        plan = self._plan_handler.handle(
            question=question,
            principal_context=principal_context,
            viewer_roles=viewer_roles,
            runtime_options={**(runtime_options or {}), "runtime_mode": "official"},
            authenticated_user=authenticated_user,
        )
        policy_decision = dict(plan.get("policy_decision") or {})
        decision = policy_decision.get("decision") or policy_decision.get("effect")
        if decision != "allow":
            logger.info(
                "agent_semantic_execute_blocked",
                metric_event="agent_semantic_execute.blocked",
                semantic_plan_id=plan.get("semantic_plan_id"),
                decision=decision,
                reason=policy_decision.get("reason"),
            )
            return {
                "status": "approval_required" if decision in {"approval_required", "require_approval"} else "blocked",
                "decision": decision or "deny",
                "reason": policy_decision.get("reason"),
                "policy_decision": policy_decision,
                "ticket_preview": plan.get("ticket_preview"),
                "semantic_trace": plan.get("semantic_trace"),
                "plan": plan,
            }

        target = self._first_executable_target(plan.get("compiled_targets") or [])
        if target is None:
            return {
                "status": "blocked",
                "reason": "没有可提交到 dw-query-gateway 的 SQL 编译目标",
                "policy_decision": policy_decision,
                "semantic_trace": plan.get("semantic_trace"),
                "plan": plan,
            }

        access_context = build_gateway_access_context(
            policy_decision=policy_decision,
            ticket_preview=plan.get("ticket_preview"),
            principal_context=plan.get("principal_context") or principal_context,
        )
        client = self._gateway_client_factory()
        gateway_result = client.execute_sql(
            sql=target["sql"],
            access_context=access_context,
            wait_for_completion=False,
            idempotency_key=idempotency_key,
            runtime_options=runtime_options or {},
        )
        gateway_query_id = gateway_result.get("query_id") or gateway_result.get("id")
        if not gateway_query_id:
            raise GatewayQueryError("dw-query-gateway 未返回 query_id")

        logger.info(
            "agent_semantic_execute_gateway_submitted",
            metric_event="agent_semantic_execute.gateway_submitted",
            semantic_plan_id=plan.get("semantic_plan_id"),
            gateway_query_id=gateway_query_id,
        )
        return {
            "status": "submitted",
            "gateway_query_id": gateway_query_id,
            "gateway": gateway_result,
            "policy_decision": policy_decision,
            "semantic_trace": plan.get("semantic_trace"),
            "plan": plan,
        }

    @staticmethod
    def _first_executable_target(compiled_targets: list[dict[str, Any]]) -> dict[str, Any] | None:
        for target in compiled_targets:
            if (target.get("target_type") or "").lower() not in {"sql", ""}:
                continue
            sql = target.get("sql") or target.get("logical_sql") or (target.get("query_dsl") or {}).get("sql")
            if sql and target.get("status", "ready") == "ready":
                return {"sql": sql, "target": target}
        return None
