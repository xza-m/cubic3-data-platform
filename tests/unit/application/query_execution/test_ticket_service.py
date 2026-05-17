from datetime import timedelta

import pytest

from app.application.query_execution.ticket_service import ExecutionTicketService
from app.domain.query_execution.enums import PolicyExecutionDecision, QueryRouteType
from app.shared.exceptions import AuthorizationError
from app.shared.utils.time import utcnow


def test_ticket_service_generates_allow_snapshot():
    service = ExecutionTicketService(default_ttl_seconds=1800)

    ticket = service.issue_snapshot(
        principal_id="u1",
        source_id=1,
        sql_hash="hash-1",
        resource_set={"physical": [{"table": "student_comments"}]},
        data_level="M1",
        policy_decision=PolicyExecutionDecision.ALLOW.value,
        semantic_plan_id="plan_1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
    )

    assert ticket.principal_id == "u1"
    assert ticket.semantic_plan_id == "plan_1"
    assert ticket.policy_decision == PolicyExecutionDecision.ALLOW.value
    assert ticket.expires_at is not None


def test_ticket_service_does_not_issue_for_approval_required():
    service = ExecutionTicketService()

    with pytest.raises(AuthorizationError) as exc:
        service.issue_snapshot(
            principal_id="u1",
            source_id=1,
            sql_hash="hash-1",
            resource_set=[],
            data_level="M1",
            policy_decision=PolicyExecutionDecision.APPROVAL_REQUIRED.value,
        )

    assert exc.value.code == "QUERY_EXECUTION_NOT_ALLOWED"


def test_ticket_service_restores_snapshot_from_dict():
    service = ExecutionTicketService()
    expires_at = utcnow() + timedelta(minutes=5)

    ticket = service.from_dict(
        {
            "principal_id": "u1",
            "source_id": 1,
            "sql_hash": "hash-1",
            "resource_set": [],
            "data_level": "M1",
            "policy_decision": "allow",
            "expires_at": expires_at.isoformat(),
            "route_type": "agent_semantic",
        }
    )

    assert ticket.expires_at == expires_at
    assert ticket.route_type == "agent_semantic"
