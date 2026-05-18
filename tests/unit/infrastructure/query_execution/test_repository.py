from datetime import timedelta

from app.domain.query_execution.entities import ExecutionTicketSnapshot
from app.domain.query_execution.enums import (
    PolicyExecutionDecision,
    QueryJobStatus,
    QueryRouteType,
)
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.shared.utils.time import utcnow


def _ticket():
    return ExecutionTicketSnapshot(
        principal_id="u1",
        source_id=1,
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
        data_level="M1",
        policy_decision=PolicyExecutionDecision.ALLOW.value,
        expires_at=utcnow() + timedelta(minutes=30),
    )


def test_repository_creates_job_with_ticket_snapshot(db_session):
    repo = QueryExecutionRepository(db_session)

    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT id FROM student_comments",
        validated_sql="SELECT id FROM student_comments LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[{"source_id": 1, "table": "student_comments"}],
        ticket_snapshot=_ticket().to_dict(),
        idempotency_key="idem-1",
    )

    assert job.id == "qry_1"
    assert job.status == QueryJobStatus.QUEUED.value
    assert job.ticket_snapshot_json["sql_hash"] == "hash-1"
    assert repo.find_by_idempotency("u1", "idem-1").id == "qry_1"


def test_repository_claims_next_job_and_writes_event(db_session):
    repo = QueryExecutionRepository(db_session)
    repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=_ticket().to_dict(),
    )

    claimed = repo.claim_next_query(
        worker_id="worker-1",
        lease_until=utcnow() + timedelta(minutes=5),
    )

    assert claimed is not None
    assert claimed.id == "qry_1"
    assert claimed.status == QueryJobStatus.CLAIMED.value
    assert claimed.lease_owner == "worker-1"
    assert repo.claim_next_query(
        worker_id="worker-2",
        lease_until=utcnow() + timedelta(minutes=5),
    ) is None
    events = repo.list_events("qry_1")
    assert [event.event_type for event in events] == ["job_created", "job_claimed"]


def test_repository_does_not_claim_terminal_jobs(db_session):
    repo = QueryExecutionRepository(db_session)
    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=_ticket().to_dict(),
    )
    repo.transition_status(job.id, QueryJobStatus.FAILED.value, event_type="job_failed")

    assert repo.claim_next_query(
        worker_id="worker-1",
        lease_until=utcnow() + timedelta(minutes=5),
    ) is None


def test_repository_recovers_expired_running_job_with_engine_query_id(db_session):
    repo = QueryExecutionRepository(db_session)
    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=_ticket().to_dict(),
    )
    claimed = repo.claim_next_query(
        worker_id="worker-old",
        lease_until=utcnow() - timedelta(seconds=1),
    )
    assert claimed is not None
    repo.mark_engine_submitted(query_id=job.id, engine_query_id="engine_1")
    repo.transition_status(job.id, QueryJobStatus.RUNNING.value, event_type="job_running")

    recovered = repo.claim_next_query(
        worker_id="worker-new",
        lease_until=utcnow() + timedelta(minutes=5),
    )

    assert recovered is not None
    assert recovered.id == "qry_1"
    assert recovered.status == QueryJobStatus.CLAIMED.value
    assert recovered.lease_owner == "worker-new"
    assert recovered.engine_query_id == "engine_1"
    events = repo.list_events("qry_1")
    assert events[-1].event_type == "job_recovered"
    assert events[-1].payload_json["worker_id"] == "worker-new"
    assert events[-1].payload_json["recovered_from_status"] == QueryJobStatus.RUNNING.value


def test_repository_does_not_recover_non_expired_running_job(db_session):
    repo = QueryExecutionRepository(db_session)
    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=_ticket().to_dict(),
    )
    repo.claim_next_query(
        worker_id="worker-old",
        lease_until=utcnow() + timedelta(minutes=5),
    )
    repo.mark_engine_submitted(query_id=job.id, engine_query_id="engine_1")
    repo.transition_status(job.id, QueryJobStatus.RUNNING.value, event_type="job_running")

    assert repo.claim_next_query(
        worker_id="worker-new",
        lease_until=utcnow() + timedelta(minutes=5),
    ) is None


def test_repository_cancel_running_job_records_cancel_request_event(db_session):
    repo = QueryExecutionRepository(db_session)
    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=_ticket().to_dict(),
    )
    repo.claim_next_query(
        worker_id="worker-1",
        lease_until=utcnow() + timedelta(minutes=5),
    )
    repo.mark_engine_submitted(query_id=job.id, engine_query_id="engine_1")
    repo.transition_status(job.id, QueryJobStatus.RUNNING.value, event_type="job_running")

    canceled = repo.cancel_job("qry_1")

    assert canceled.status == QueryJobStatus.CANCELING.value
    assert canceled.cancel_requested is True
    events = repo.list_events("qry_1")
    assert events[-1].event_type == "job_cancel_requested"
    assert events[-1].payload_json["cancel_requested"] is True


def test_repository_does_not_renew_terminal_job_lease(db_session):
    repo = QueryExecutionRepository(db_session)
    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=_ticket().to_dict(),
    )
    repo.claim_next_query(
        worker_id="worker-1",
        lease_until=utcnow() + timedelta(minutes=5),
    )
    repo.transition_status(job.id, QueryJobStatus.FAILED.value, event_type="job_failed")

    assert repo.renew_lease(
        query_id=job.id,
        worker_id="worker-1",
        lease_until=utcnow() + timedelta(minutes=5),
    ) is False
