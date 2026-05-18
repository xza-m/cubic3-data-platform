from datetime import timedelta

import pytest

from app.application.query_execution.result_service import QueryResultService
from app.domain.query_execution.enums import QueryJobStatus, QueryRouteType
from app.domain.query_execution.entities import ExecutionTicketSnapshot
from app.infrastructure.query_execution.models import QueryResultObjectORM
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.infrastructure.query_execution.result_store import LocalSpoolResultStore
from app.shared.exceptions import EntityNotFoundError, InvalidOperationError
from app.shared.utils.time import utcnow


def _create_job(db_session, *, principal_id="u1", status=QueryJobStatus.QUEUED.value):
    repo = QueryExecutionRepository(db_session)
    ticket = ExecutionTicketSnapshot(
        principal_id=principal_id,
        source_id=1,
        sql_hash="hash-1",
        resource_set=[],
        data_level="M1",
        expires_at=utcnow() + timedelta(minutes=30),
    )
    job = repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id=principal_id,
        route_type=QueryRouteType.MANUAL_SQL.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash="hash-1",
        resource_set=[],
        ticket_snapshot=ticket.to_dict(),
    )
    if status != QueryJobStatus.QUEUED.value:
        repo.transition_status(job.id, status, event_type="forced_status")
    return job


def test_result_service_hides_jobs_from_other_principals(db_session):
    _create_job(db_session, principal_id="u1")
    service = QueryResultService(repository=QueryExecutionRepository(db_session))

    with pytest.raises(EntityNotFoundError):
        service.get_job(query_id="qry_1", principal_id="u2")


def test_result_service_returns_ready_result_metadata(db_session):
    _create_job(db_session, principal_id="u1", status=QueryJobStatus.SUCCEEDED.value)
    result = QueryResultObjectORM(
        query_id="qry_1",
        status="READY",
        storage_type="local",
        content_type="text/csv",
        file_path="qry_1.csv",
        row_count=1,
        byte_size=16,
        sha256="abc",
        preview_json={"columns": ["ok"], "rows": [{"ok": 1}]},
    )
    db_session.add(result)
    db_session.commit()
    service = QueryResultService(repository=QueryExecutionRepository(db_session))

    metadata = service.get_result_metadata(query_id="qry_1", principal_id="u1")

    assert metadata["status"] == "READY"
    assert metadata["row_count"] == 1
    assert metadata["preview"]["rows"] == [{"ok": 1}]


def test_result_service_cancels_queued_job(db_session):
    _create_job(db_session, principal_id="u1")
    service = QueryResultService(repository=QueryExecutionRepository(db_session))

    job = service.cancel(query_id="qry_1", principal_id="u1")

    assert job.status == QueryJobStatus.CANCELED.value


def test_result_service_rejects_cancel_terminal_job(db_session):
    _create_job(db_session, principal_id="u1", status=QueryJobStatus.SUCCEEDED.value)
    service = QueryResultService(repository=QueryExecutionRepository(db_session))

    with pytest.raises(InvalidOperationError):
        service.cancel(query_id="qry_1", principal_id="u1")


def test_result_service_expires_ready_results_and_removes_local_file(db_session, tmp_path):
    _create_job(db_session, principal_id="u1", status=QueryJobStatus.SUCCEEDED.value)
    result_path = tmp_path / "qry_1.csv"
    result_path.write_text("ok\n1\n", encoding="utf-8")
    result = QueryResultObjectORM(
        query_id="qry_1",
        status="READY",
        storage_type="local",
        content_type="text/csv",
        file_path="qry_1.csv",
        row_count=1,
        byte_size=result_path.stat().st_size,
        sha256="abc",
        preview_json={"columns": ["ok"], "rows": [{"ok": 1}]},
        expires_at=utcnow() - timedelta(seconds=1),
        ready_at=utcnow() - timedelta(minutes=5),
    )
    db_session.add(result)
    db_session.commit()
    repo = QueryExecutionRepository(db_session)
    service = QueryResultService(repository=repo)

    cleanup = service.cleanup_expired_results(
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
        now=utcnow(),
    )

    assert cleanup == {"expired": 1, "failed": 0}
    assert result_path.exists() is False
    expired = repo.get_result_by_query_id("qry_1")
    assert expired.status == "EXPIRED"
    events = repo.list_events("qry_1")
    assert events[-1].event_type == "result_expired"
