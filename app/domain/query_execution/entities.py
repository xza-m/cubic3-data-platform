from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.domain.query_execution.enums import (
    PolicyExecutionDecision,
    QueryJobStatus,
    QueryRouteType,
)
from app.shared.exceptions import InvalidOperationError
from app.shared.utils.time import utcnow


_TERMINAL_STATUSES = {
    QueryJobStatus.SUCCEEDED.value,
    QueryJobStatus.FAILED.value,
    QueryJobStatus.CANCELED.value,
}

_ALLOWED_TRANSITIONS = {
    QueryJobStatus.QUEUED.value: {
        QueryJobStatus.CLAIMED.value,
        QueryJobStatus.CANCELED.value,
        QueryJobStatus.FAILED.value,
    },
    QueryJobStatus.CLAIMED.value: {
        QueryJobStatus.SUBMITTING.value,
        QueryJobStatus.CANCELING.value,
        QueryJobStatus.FAILED.value,
    },
    QueryJobStatus.SUBMITTING.value: {
        QueryJobStatus.RUNNING.value,
        QueryJobStatus.CANCELING.value,
        QueryJobStatus.FAILED.value,
    },
    QueryJobStatus.RUNNING.value: {
        QueryJobStatus.FETCHING.value,
        QueryJobStatus.CANCELING.value,
        QueryJobStatus.FAILED.value,
    },
    QueryJobStatus.FETCHING.value: {
        QueryJobStatus.PERSISTING.value,
        QueryJobStatus.CANCELING.value,
        QueryJobStatus.FAILED.value,
    },
    QueryJobStatus.PERSISTING.value: {
        QueryJobStatus.SUCCEEDED.value,
        QueryJobStatus.FAILED.value,
    },
    QueryJobStatus.CANCELING.value: {
        QueryJobStatus.CANCELED.value,
        QueryJobStatus.FAILED.value,
    },
}


def _enum_value(value: str | QueryJobStatus | QueryRouteType | PolicyExecutionDecision) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _canonical_json(value: Any) -> str:
    return json.dumps(value or [], sort_keys=True, ensure_ascii=False, separators=(",", ":"))


@dataclass(frozen=True)
class ExecutionTicketSnapshot:
    """控制面生成、执行面校验的执行票据快照。"""

    principal_id: str
    source_id: int
    sql_hash: str
    resource_set: Any
    data_level: str
    policy_decision: str = PolicyExecutionDecision.ALLOW.value
    expires_at: datetime | None = None
    approval_id: str | None = None
    semantic_plan_id: str | None = None
    route_type: str = QueryRouteType.AGENT_SEMANTIC.value
    created_at: datetime = field(default_factory=utcnow)

    def validate_for_job(
        self,
        *,
        principal_id: str,
        source_id: int,
        sql_hash: str,
        resource_set: Any,
        now: datetime | None = None,
        approval_required: bool = False,
    ) -> list[str]:
        """返回所有阻断执行的问题码。"""

        issues: list[str] = []
        current = now or utcnow()
        if self.expires_at is not None and self.expires_at <= current:
            issues.append("ticket_expired")
        if self.principal_id != principal_id:
            issues.append("principal_mismatch")
        if int(self.source_id) != int(source_id):
            issues.append("source_mismatch")
        if self.sql_hash != sql_hash:
            issues.append("sql_hash_mismatch")
        if _canonical_json(self.resource_set) != _canonical_json(resource_set):
            issues.append("resource_set_mismatch")
        if self.policy_decision != PolicyExecutionDecision.ALLOW.value:
            issues.append("policy_not_allowed")
        if approval_required and not self.approval_id:
            issues.append("approval_missing")
        return issues

    def to_dict(self) -> dict[str, Any]:
        return {
            "principal_id": self.principal_id,
            "source_id": self.source_id,
            "sql_hash": self.sql_hash,
            "resource_set": self.resource_set,
            "data_level": self.data_level,
            "policy_decision": self.policy_decision,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "approval_id": self.approval_id,
            "semantic_plan_id": self.semantic_plan_id,
            "route_type": self.route_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExecutionTicketSnapshot":
        def _parse_dt(value: Any) -> datetime | None:
            if value is None or isinstance(value, datetime):
                return value
            return datetime.fromisoformat(str(value))

        return cls(
            principal_id=str(data.get("principal_id") or ""),
            source_id=int(data.get("source_id") or 0),
            sql_hash=str(data.get("sql_hash") or ""),
            resource_set=data.get("resource_set") or data.get("resource_set_json") or [],
            data_level=str(data.get("data_level") or "M1"),
            policy_decision=str(data.get("policy_decision") or PolicyExecutionDecision.ALLOW.value),
            expires_at=_parse_dt(data.get("expires_at")),
            approval_id=data.get("approval_id"),
            semantic_plan_id=data.get("semantic_plan_id"),
            route_type=str(data.get("route_type") or QueryRouteType.AGENT_SEMANTIC.value),
            created_at=_parse_dt(data.get("created_at")) or utcnow(),
        )


@dataclass
class QueryJob:
    """查询执行任务的领域态。"""

    id: str
    trace_id: str
    principal_id: str
    route_type: str
    source_id: int
    logical_sql: str
    validated_sql: str
    sql_hash: str
    resource_set: Any
    ticket_snapshot: ExecutionTicketSnapshot
    status: str = QueryJobStatus.QUEUED.value

    def __post_init__(self) -> None:
        self.route_type = _enum_value(self.route_type)
        self.status = _enum_value(self.status)

    def transition_to(self, next_status: str | QueryJobStatus) -> None:
        target = _enum_value(next_status)
        if self.status in _TERMINAL_STATUSES:
            raise InvalidOperationError(
                f"Query job {self.id} already terminated at {self.status}"
            )
        allowed = _ALLOWED_TRANSITIONS.get(self.status, set())
        if target not in allowed:
            raise InvalidOperationError(
                f"Query job {self.id} cannot transition from {self.status} to {target}"
            )
        self.status = target

    def is_terminal(self) -> bool:
        return self.status in _TERMINAL_STATUSES
