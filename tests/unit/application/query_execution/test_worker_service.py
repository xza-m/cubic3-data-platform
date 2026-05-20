from datetime import timedelta

from app.application.query_execution.ticket_service import ExecutionTicketService
from app.application.query_execution.worker_service import QueryExecutionWorkerService
from app.domain.query_execution.entities import ExecutionTicketSnapshot
from app.domain.query_execution.enums import QueryJobStatus, QueryRouteType
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.infrastructure.query_execution.result_store import LocalSpoolResultStore
from app.shared.utils.time import utcnow


class _FakeAdapter:
    def __init__(self, *, result=None, status="SUCCEEDED", submit_errors=None):
        self.result = result or {"columns": ["ok"], "rows": [{"ok": 1}]}
        self.status = status
        self.submit_errors = list(submit_errors or [])
        self.submitted_sql = []
        self.status_calls = []
        self.fetch_calls = []
        self.cancel_calls = []

    def submit(self, *, source_id: int, sql: str) -> str:
        self.submitted_sql.append((source_id, sql))
        if self.submit_errors:
            raise self.submit_errors.pop(0)
        return "engine_1"

    def get_status(self, engine_query_id: str) -> str:
        self.status_calls.append(engine_query_id)
        return self.status

    def fetch_result(self, engine_query_id: str):
        self.fetch_calls.append(engine_query_id)
        return self.result

    def cancel(self, engine_query_id: str) -> None:
        self.cancel_calls.append(engine_query_id)


def _runtime_version_pin():
    return {
        "snapshot_id": "snap_1",
        "release_id": "rel_1",
        "release_no": 1,
    }


def _create_job(db_session, *, ticket_sql_hash="hash-1", job_sql_hash="hash-1", governance_snapshot=None):
    repo = QueryExecutionRepository(db_session)
    ticket = ExecutionTicketSnapshot(
        principal_id="u1",
        source_id=1,
        sql_hash=ticket_sql_hash,
        resource_set=[],
        data_level="M1",
        expires_at=utcnow() + timedelta(minutes=30),
    )
    return repo.create_job(
        job_id="qry_1",
        trace_id="trace_1",
        principal_id="u1",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        source_id=1,
        logical_sql="SELECT 1",
        validated_sql="SELECT 1 LIMIT 50000",
        sql_hash=job_sql_hash,
        resource_set=[],
        ticket_snapshot=ticket.to_dict(),
        governance_snapshot=governance_snapshot
        if governance_snapshot is not None
        else {
            "query_dsl": {
                "dsl_version": "v1",
                "measures": ["student_comment_cube.comment_count"],
            },
            "runtime_version_pin": _runtime_version_pin(),
        },
    )


def test_worker_service_executes_one_job(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)
    adapter = _FakeAdapter()
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.SUCCEEDED.value
    assert adapter.submitted_sql == [(1, "SELECT 1 LIMIT 50000")]
    result = repo.get_result_by_query_id("qry_1")
    assert result.status == "READY"
    assert result.preview_json["rows"] == [{"ok": 1}]


def test_worker_service_fails_job_when_ticket_snapshot_mismatches(db_session, tmp_path):
    _create_job(db_session, ticket_sql_hash="old-hash", job_sql_hash="hash-1")
    repo = QueryExecutionRepository(db_session)
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=_FakeAdapter(),
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.FAILED.value
    assert job.error_code == "INVALID_TICKET_SNAPSHOT"


def test_worker_service_fails_agent_job_without_versioned_query_dsl(db_session, tmp_path):
    _create_job(
        db_session,
        governance_snapshot={
            "query_dsl": {"measures": ["student_comment_cube.comment_count"]},
            "runtime_version_pin": _runtime_version_pin(),
        },
    )
    repo = QueryExecutionRepository(db_session)
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=_FakeAdapter(),
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.FAILED.value
    assert job.error_code == "INVALID_AGENT_SEMANTIC_SNAPSHOT"


def test_worker_service_fails_agent_job_without_runtime_version_pin(db_session, tmp_path):
    _create_job(db_session, governance_snapshot={"query_dsl": {"dsl_version": "v1"}})
    repo = QueryExecutionRepository(db_session)
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=_FakeAdapter(),
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.FAILED.value
    assert job.error_code == "INVALID_AGENT_SEMANTIC_SNAPSHOT"


def test_worker_service_recovers_engine_query_without_resubmitting(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)
    repo.claim_next_query(
        worker_id="worker-old",
        lease_until=utcnow() - timedelta(seconds=1),
    )
    repo.mark_engine_submitted(query_id="qry_1", engine_query_id="engine_1")
    repo.transition_status("qry_1", QueryJobStatus.RUNNING.value, event_type="job_running")
    adapter = _FakeAdapter()
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-new")

    assert job.status == QueryJobStatus.SUCCEEDED.value
    assert adapter.submitted_sql == []
    assert adapter.status_calls == ["engine_1"]
    assert adapter.fetch_calls == ["engine_1"]


def test_worker_service_cancels_engine_query_when_cancel_requested(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)
    repo.claim_next_query(
        worker_id="worker-old",
        lease_until=utcnow() - timedelta(seconds=1),
    )
    repo.mark_engine_submitted(query_id="qry_1", engine_query_id="engine_1")
    repo.transition_status("qry_1", QueryJobStatus.RUNNING.value, event_type="job_running")
    repo.cancel_job("qry_1")
    adapter = _FakeAdapter()
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-new")

    assert job.status == QueryJobStatus.CANCELED.value
    assert adapter.cancel_calls == ["engine_1"]
    assert adapter.fetch_calls == []


def test_worker_service_stops_when_lease_renew_fails(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)
    original_renew = repo.renew_lease
    renew_calls = 0

    def _renew_once_then_fail(**kwargs):
        nonlocal renew_calls
        renew_calls += 1
        if renew_calls == 1:
            return original_renew(**kwargs)
        return False

    repo.renew_lease = _renew_once_then_fail
    adapter = _FakeAdapter()
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.RUNNING.value
    assert adapter.submitted_sql == [(1, "SELECT 1 LIMIT 50000")]
    assert adapter.fetch_calls == []


def test_worker_service_fails_job_when_result_is_too_large(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)
    adapter = _FakeAdapter(result={"columns": ["body"], "rows": [{"body": "this row is too large"}]})
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path, max_result_bytes=10),
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.FAILED.value
    assert job.error_code == "RESULT_TOO_LARGE"


def test_worker_service_retries_retryable_submit_error(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)

    class _RetryableError(RuntimeError):
        code = "WAREHOUSE_TRANSIENT_ERROR"
        retryable = True

    adapter = _FakeAdapter(submit_errors=[_RetryableError("timeout")])
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
        max_submit_attempts=3,
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.SUCCEEDED.value
    assert adapter.submitted_sql == [(1, "SELECT 1 LIMIT 50000"), (1, "SELECT 1 LIMIT 50000")]
    events = repo.list_events("qry_1")
    assert "job_submit_retry" in [event.event_type for event in events]


def test_worker_service_does_not_retry_non_retryable_submit_error(db_session, tmp_path):
    _create_job(db_session)
    repo = QueryExecutionRepository(db_session)

    class _SyntaxError(RuntimeError):
        code = "WAREHOUSE_SQL_SYNTAX_ERROR"
        retryable = False

    adapter = _FakeAdapter(submit_errors=[_SyntaxError("syntax error")])
    service = QueryExecutionWorkerService(
        repository=repo,
        ticket_service=ExecutionTicketService(),
        adapter=adapter,
        result_store=LocalSpoolResultStore(spool_dir=tmp_path),
        max_submit_attempts=3,
    )

    job = service.process_next(worker_id="worker-1")

    assert job.status == QueryJobStatus.FAILED.value
    assert job.error_code == "WAREHOUSE_SQL_SYNTAX_ERROR"
    assert adapter.submitted_sql == [(1, "SELECT 1 LIMIT 50000")]
