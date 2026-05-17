from __future__ import annotations

from datetime import timedelta
from typing import Any

from app.domain.query_execution.entities import ExecutionTicketSnapshot
from app.domain.query_execution.enums import PolicyExecutionDecision, QueryRouteType
from app.shared.exceptions import AuthorizationError
from app.shared.utils.time import utcnow


class ExecutionTicketService:
    """生成和恢复执行票据快照。

    第一版不创建独立 ticket 表，也不生成签名；ticket snapshot 作为
    控制面提交 job 时写入的不可变审计材料，由 Worker 执行前复核。
    """

    def __init__(self, *, default_ttl_seconds: int = 300):
        self.default_ttl_seconds = default_ttl_seconds

    def issue_snapshot(
        self,
        *,
        principal_id: str,
        source_id: int,
        sql_hash: str,
        resource_set: Any,
        data_level: str,
        policy_decision: str,
        semantic_plan_id: str | None = None,
        route_type: str = QueryRouteType.AGENT_SEMANTIC.value,
        approval_id: str | None = None,
        project_name: str | None = None,
    ) -> ExecutionTicketSnapshot:
        del project_name
        decision = str(policy_decision or "").strip().lower()
        if decision != PolicyExecutionDecision.ALLOW.value:
            raise AuthorizationError(
                "Only allow decisions can issue executable query tickets",
                code="QUERY_EXECUTION_NOT_ALLOWED",
                details={"policy_decision": decision},
            )
        return ExecutionTicketSnapshot(
            principal_id=str(principal_id),
            source_id=int(source_id),
            sql_hash=str(sql_hash),
            resource_set=resource_set,
            data_level=str(data_level or "M1"),
            policy_decision=PolicyExecutionDecision.ALLOW.value,
            expires_at=utcnow() + timedelta(seconds=self.default_ttl_seconds),
            approval_id=approval_id,
            semantic_plan_id=semantic_plan_id,
            route_type=route_type,
        )

    def from_dict(self, data: dict[str, Any]) -> ExecutionTicketSnapshot:
        return ExecutionTicketSnapshot.from_dict(data)

    def validate_snapshot_for_job(
        self,
        *,
        snapshot: dict[str, Any],
        principal_id: str,
        source_id: int,
        sql_hash: str,
        resource_set: Any,
        approval_required: bool = False,
    ) -> list[str]:
        ticket = self.from_dict(snapshot)
        return ticket.validate_for_job(
            principal_id=principal_id,
            source_id=source_id,
            sql_hash=sql_hash,
            resource_set=resource_set,
            approval_required=approval_required,
        )
