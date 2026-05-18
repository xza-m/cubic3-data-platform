from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from typing import Any

from app.application.governance.access import canonical_sql_hash
from app.application.query_execution.sql_guard import SqlGuard
from app.application.query_execution.ticket_service import ExecutionTicketService
from app.domain.query_execution.enums import PolicyExecutionDecision, QueryRouteType
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.shared.exceptions import InvalidSQLError, ValidationError
from app.shared.utils.time import utcnow


@dataclass(frozen=True)
class SubmittedQuery:
    query_id: str
    trace_id: str
    status: str
    poll_url: str
    result_url: str
    idempotency_key: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "query_id": self.query_id,
            "trace_id": self.trace_id,
            "status": self.status,
            "poll_url": self.poll_url,
            "result_url": self.result_url,
            "idempotency_key": self.idempotency_key,
        }


class QuerySubmissionService:
    """查询执行提交服务，只创建异步 job，不直接执行 SQL。"""

    def __init__(
        self,
        *,
        repository: QueryExecutionRepository,
        sql_guard: SqlGuard,
        ticket_service: ExecutionTicketService,
    ):
        self.repository = repository
        self.sql_guard = sql_guard
        self.ticket_service = ticket_service

    def submit(
        self,
        *,
        principal_id: str,
        source_id: int,
        sql_query: str,
        route_type: str,
        resource_set: Any,
        semantic_plan_id: str | None = None,
        sql_hash: str | None = None,
        data_level: str = "M1",
        project_name: str | None = None,
        governance_snapshot: dict[str, Any] | None = None,
        policy_decision: str = PolicyExecutionDecision.ALLOW.value,
        approval_id: str | None = None,
        idempotency_key: str | None = None,
        result_mode: str = "preview",
    ) -> SubmittedQuery:
        principal = str(principal_id or "").strip()
        if not principal:
            raise ValidationError("principal_id is required")
        if not source_id or int(source_id) <= 0:
            raise ValidationError("source_id is required")

        guarded = self.sql_guard.validate(sql_query, result_mode=result_mode)

        effective_sql_hash = sql_hash or canonical_sql_hash(sql_query)
        effective_route_type = route_type or QueryRouteType.MANUAL_SQL.value
        self._validate_agent_semantic_snapshot(
            route_type=effective_route_type,
            governance_snapshot=governance_snapshot,
        )
        effective_idempotency = idempotency_key or self._default_idempotency_key(
            principal_id=principal,
            route_type=effective_route_type,
            source_id=int(source_id),
            sql_hash=effective_sql_hash,
        )
        ticket = self.ticket_service.issue_snapshot(
            principal_id=principal,
            source_id=int(source_id),
            sql_hash=effective_sql_hash,
            resource_set=resource_set,
            data_level=data_level,
            policy_decision=policy_decision,
            semantic_plan_id=semantic_plan_id,
            route_type=effective_route_type,
            approval_id=approval_id,
            project_name=project_name,
        )
        issues = ticket.validate_for_job(
            principal_id=principal,
            source_id=int(source_id),
            sql_hash=effective_sql_hash,
            resource_set=resource_set,
        )
        if issues:
            raise ValidationError("ticket snapshot does not match query job", details={"issues": issues})

        job = self.repository.create_job(
            job_id=f"qry_{uuid.uuid4().hex}",
            trace_id=f"qtr_{uuid.uuid4().hex}",
            principal_id=principal,
            route_type=effective_route_type,
            source_id=int(source_id),
            logical_sql=str(sql_query).strip(),
            validated_sql=guarded.validated_sql,
            sql_hash=effective_sql_hash,
            resource_set=resource_set,
            ticket_snapshot=ticket.to_dict(),
            data_level=data_level,
            semantic_plan_id=semantic_plan_id,
            project_name=project_name,
            governance_snapshot=governance_snapshot,
            idempotency_key=effective_idempotency,
        )
        return SubmittedQuery(
            query_id=job.id,
            trace_id=job.trace_id,
            status=job.status,
            poll_url=f"/api/v1/query-execution/jobs/{job.id}",
            result_url=f"/api/v1/query-execution/jobs/{job.id}/results",
            idempotency_key=job.idempotency_key,
        )

    @staticmethod
    def _default_idempotency_key(
        *,
        principal_id: str,
        route_type: str,
        source_id: int,
        sql_hash: str,
    ) -> str:
        hour_bucket = utcnow().strftime("%Y%m%d%H")
        raw = f"{principal_id}:{route_type}:{source_id}:{sql_hash}:{hour_bucket}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _validate_agent_semantic_snapshot(
        *,
        route_type: str,
        governance_snapshot: dict[str, Any] | None,
    ) -> None:
        if route_type != QueryRouteType.AGENT_SEMANTIC.value:
            return
        query_dsl = (governance_snapshot or {}).get("query_dsl")
        if not isinstance(query_dsl, dict) or query_dsl.get("dsl_version") != "v1":
            raise ValidationError(
                "Agent semantic query job requires a versioned QueryDSL v1 snapshot",
                code="INVALID_AGENT_SEMANTIC_QUERY_DSL",
                details={"route_type": route_type},
            )
