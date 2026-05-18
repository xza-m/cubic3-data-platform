from datetime import timedelta

import pytest

from app.domain.query_execution.entities import ExecutionTicketSnapshot, QueryJob
from app.domain.query_execution.enums import (
    PolicyExecutionDecision,
    QueryJobStatus,
    QueryRouteType,
)
from app.shared.exceptions import InvalidOperationError
from app.shared.utils.time import utcnow


def _ticket(**overrides):
    data = {
        "principal_id": "u1",
        "source_id": 1,
        "sql_hash": "hash-1",
        "resource_set": [{"source_id": 1, "table": "student_comments"}],
        "data_level": "M1",
        "policy_decision": PolicyExecutionDecision.ALLOW.value,
        "expires_at": utcnow() + timedelta(minutes=30),
    }
    data.update(overrides)
    return ExecutionTicketSnapshot(**data)


def test_ticket_snapshot_validates_against_job_context():
    ticket = _ticket()

    issues = ticket.validate_for_job(
        principal_id="u1",
        source_id=1,
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
    )

    assert issues == []


def test_ticket_snapshot_reports_mismatches_and_expiration():
    ticket = _ticket(
        principal_id="u1",
        source_id=1,
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
        expires_at=utcnow() - timedelta(seconds=1),
    )

    issues = ticket.validate_for_job(
        principal_id="u2",
        source_id=2,
        sql_hash="hash-2",
        resource_set=[{"source_id": 2, "table": "other"}],
    )

    assert "ticket_expired" in issues
    assert "principal_mismatch" in issues
    assert "source_mismatch" in issues
    assert "sql_hash_mismatch" in issues
    assert "resource_set_mismatch" in issues


def test_ticket_snapshot_requires_allow_decision():
    ticket = _ticket(policy_decision=PolicyExecutionDecision.DENY.value)

    issues = ticket.validate_for_job(
        principal_id="u1",
        source_id=1,
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
    )

    assert "policy_not_allowed" in issues


def test_ticket_snapshot_reports_missing_required_approval():
    ticket = _ticket(approval_id=None)

    issues = ticket.validate_for_job(
        principal_id="u1",
        source_id=1,
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
        approval_required=True,
    )

    assert "approval_missing" in issues


def test_query_job_status_transition_allows_happy_path():
    job = QueryJob(
        id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
        ticket_snapshot=_ticket(),
    )

    for status in (
        QueryJobStatus.CLAIMED,
        QueryJobStatus.SUBMITTING,
        QueryJobStatus.RUNNING,
        QueryJobStatus.FETCHING,
        QueryJobStatus.PERSISTING,
        QueryJobStatus.SUCCEEDED,
    ):
        job.transition_to(status)

    assert job.status == QueryJobStatus.SUCCEEDED.value
    assert job.is_terminal()


def test_query_job_rejects_invalid_transition_from_terminal_state():
    job = QueryJob(
        id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        status=QueryJobStatus.SUCCEEDED.value,
        ticket_snapshot=_ticket(),
    )

    with pytest.raises(InvalidOperationError):
        job.transition_to(QueryJobStatus.RUNNING)
