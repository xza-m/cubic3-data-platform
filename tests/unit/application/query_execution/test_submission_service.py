import pytest

from app.application.query_execution.sql_guard import SqlGuard
from app.application.query_execution.submission_service import QuerySubmissionService
from app.application.query_execution.ticket_service import ExecutionTicketService
from app.domain.query_execution.enums import QueryJobStatus, QueryRouteType
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.shared.exceptions import InvalidSQLError
from app.shared.exceptions import ValidationError


def _service(db_session):
    return QuerySubmissionService(
        repository=QueryExecutionRepository(db_session),
        sql_guard=SqlGuard(default_limit=50000),
        ticket_service=ExecutionTicketService(default_ttl_seconds=1800),
    )


def _runtime_version_pin():
    return {
        "snapshot_id": "snap_1",
        "release_id": "rel_1",
        "release_no": 1,
    }


def test_submission_service_creates_ticketed_job(db_session):
    service = _service(db_session)

    submitted = service.submit(
        principal_id="u1",
        source_id=1,
        sql_query="SELECT id FROM student_comments",
        route_type=QueryRouteType.AGENT_SEMANTIC.value,
        semantic_plan_id="plan_1",
        resource_set={"physical": [{"table": "student_comments"}]},
        sql_hash="hash-1",
        data_level="M1",
        governance_snapshot={
            "query_dsl": {
                "dsl_version": "v1",
                "measures": ["student_comment_cube.comment_count"],
            },
            "runtime_version_pin": _runtime_version_pin(),
        },
    )

    assert submitted.status == QueryJobStatus.QUEUED.value
    assert submitted.poll_url == f"/api/v1/query-execution/jobs/{submitted.query_id}"
    job = QueryExecutionRepository(db_session).get_by_id(submitted.query_id)
    assert job.validated_sql == "SELECT id FROM student_comments LIMIT 50000"
    assert job.ticket_snapshot_json["semantic_plan_id"] == "plan_1"


def test_submission_service_is_idempotent_for_same_key(db_session):
    service = _service(db_session)

    first = service.submit(
        principal_id="u1",
        source_id=1,
        sql_query="SELECT 1",
        route_type=QueryRouteType.MANUAL_SQL.value,
        resource_set=[],
        idempotency_key="same-key",
    )
    second = service.submit(
        principal_id="u1",
        source_id=1,
        sql_query="SELECT 1",
        route_type=QueryRouteType.MANUAL_SQL.value,
        resource_set=[],
        idempotency_key="same-key",
    )

    assert second.query_id == first.query_id
    events = QueryExecutionRepository(db_session).list_events(first.query_id)
    assert [event.event_type for event in events] == ["job_created"]


def test_submission_service_rejects_write_sql(db_session):
    service = _service(db_session)

    with pytest.raises(InvalidSQLError):
        service.submit(
            principal_id="u1",
            source_id=1,
            sql_query="INSERT OVERWRITE TABLE t SELECT 1",
            route_type=QueryRouteType.MANUAL_SQL.value,
            resource_set=[],
        )


def test_submission_service_requires_versioned_query_dsl_for_agent_semantic_jobs(db_session):
    service = _service(db_session)

    with pytest.raises(ValidationError, match="QueryDSL"):
        service.submit(
            principal_id="u1",
            source_id=1,
            sql_query="SELECT 1",
            route_type=QueryRouteType.AGENT_SEMANTIC.value,
            resource_set=[],
            governance_snapshot={
                "query_dsl": {"measures": ["student_comment_cube.comment_count"]},
                "runtime_version_pin": _runtime_version_pin(),
            },
        )


def test_submission_service_requires_runtime_version_pin_for_agent_semantic_jobs(db_session):
    service = _service(db_session)

    with pytest.raises(ValidationError, match="Runtime version pin"):
        service.submit(
            principal_id="u1",
            source_id=1,
            sql_query="SELECT 1",
            route_type=QueryRouteType.AGENT_SEMANTIC.value,
            resource_set=[],
            governance_snapshot={"query_dsl": {"dsl_version": "v1"}},
        )
