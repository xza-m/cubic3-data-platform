from app.application.query_execution.agent_execute_service import AgentSemanticExecuteService
from app.application.query_execution.sql_guard import SqlGuard
from app.application.query_execution.submission_service import QuerySubmissionService
from app.application.query_execution.ticket_service import ExecutionTicketService
from app.domain.query_execution.enums import QueryRouteType
from app.infrastructure.query_execution.repositories import QueryExecutionRepository


class _FakePlanHandler:
    def __init__(self, response):
        self.response = response

    def handle(self, **kwargs):
        return self.response


class _FakeSubmissionService:
    def __init__(self):
        self.calls = []

    def submit(self, **kwargs):
        self.calls.append(kwargs)

        class _Submitted:
            query_id = "qry_1"
            trace_id = "trace_1"
            status = "QUEUED"
            poll_url = "/api/v1/query-execution/jobs/qry_1"
            result_url = "/api/v1/query-execution/jobs/qry_1/results"

            def to_dict(self):
                return {
                    "query_id": self.query_id,
                    "trace_id": self.trace_id,
                    "status": self.status,
                    "poll_url": self.poll_url,
                    "result_url": self.result_url,
                }

        return _Submitted()


def test_agent_execute_service_returns_approval_material_without_job():
    submitter = _FakeSubmissionService()
    service = AgentSemanticExecuteService(
        plan_handler=_FakePlanHandler(
            {
                "policy_decision": {
                    "decision": "approval_required",
                    "reason": "M2 data requires approval",
                },
                "ticket_preview": {"approval_required": True},
                "compiled_targets": [],
                "semantic_trace": {"semantic_plan_id": "plan_1"},
            }
        ),
        submission_service=submitter,
    )

    result = service.execute(question="查看学生评论")

    assert result["status"] == "approval_required"
    assert submitter.calls == []


def test_agent_execute_service_submits_first_ready_sql_target():
    submitter = _FakeSubmissionService()
    service = AgentSemanticExecuteService(
        plan_handler=_FakePlanHandler(
            {
                "semantic_plan_id": "plan_1",
                "principal_context": {"principal_id": "u1"},
                "policy_decision": {"decision": "allow"},
                "compiled_targets": [
                    {
                        "status": "ready",
                        "target_type": "sql",
                        "logical_sql": "SELECT 1",
                        "query_dsl": {
                            "dsl_version": "v1",
                            "measures": ["student_comment_cube.comment_count"],
                        },
                        "sql_hash": "hash-1",
                        "resource_set": {"physical": []},
                        "data_level": "M1",
                        "execution_request": {"source_id": 1, "sql_query": "SELECT 1"},
                    }
                ],
                "semantic_trace": {"semantic_plan_id": "plan_1"},
            }
        ),
        submission_service=submitter,
    )

    result = service.execute(question="查看学生评论")

    assert result["status"] == "submitted"
    assert result["query_id"] == "qry_1"
    assert submitter.calls[0]["semantic_plan_id"] == "plan_1"
    assert submitter.calls[0]["route_type"] == "agent_semantic"
    assert submitter.calls[0]["governance_snapshot"]["query_dsl"] == {
        "dsl_version": "v1",
        "measures": ["student_comment_cube.comment_count"]
    }


def test_agent_execute_service_blocks_ready_sql_target_without_query_dsl():
    submitter = _FakeSubmissionService()
    service = AgentSemanticExecuteService(
        plan_handler=_FakePlanHandler(
            {
                "semantic_plan_id": "plan_1",
                "principal_context": {"principal_id": "u1"},
                "policy_decision": {"decision": "allow"},
                "compiled_targets": [
                    {
                        "status": "ready",
                        "target_type": "sql",
                        "logical_sql": "SELECT 1",
                        "sql_hash": "hash-1",
                        "resource_set": {"physical": []},
                        "data_level": "M1",
                        "execution_request": {"source_id": 1, "sql_query": "SELECT 1"},
                    }
                ],
                "semantic_trace": {"semantic_plan_id": "plan_1"},
            }
        ),
        submission_service=submitter,
    )

    result = service.execute(question="查看学生评论")

    assert result["status"] == "blocked"
    assert "QueryDSL" in result["reason"]
    assert submitter.calls == []


def test_agent_execute_service_submits_active_ontology_and_cube_plan_to_query_job(db_session):
    repo = QueryExecutionRepository(db_session)
    submitter = QuerySubmissionService(
        repository=repo,
        sql_guard=SqlGuard(default_limit=50000),
        ticket_service=ExecutionTicketService(default_ttl_seconds=300),
    )
    resource_set = {
        "cubes": [{"name": "student_comment_cube", "status": "active"}],
        "ontology": [{"name": "student_comment_metric", "status": "active"}],
    }
    service = AgentSemanticExecuteService(
        plan_handler=_FakePlanHandler(
            {
                "semantic_plan_id": "plan_active_student_comments",
                "principal_context": {"principal_id": "u1"},
                "policy_decision": {"decision": "allow"},
                "compiled_targets": [
                    {
                        "status": "ready",
                        "target_type": "sql",
                        "logical_sql": "SELECT COUNT(*) AS comment_cnt FROM dwd_student_comments",
                        "query_dsl": {
                            "dsl_version": "v1",
                            "measures": ["student_comment_cube.comment_count"],
                        },
                        "sql_hash": "hash-student-comment-count",
                        "resource_set": resource_set,
                        "data_level": "M1",
                        "execution_request": {
                            "source_id": 1,
                            "sql_query": "SELECT COUNT(*) AS comment_cnt FROM dwd_student_comments",
                        },
                    }
                ],
                "semantic_trace": {
                    "ontology_status": "active",
                    "cube_status": "active",
                    "binding_status": "bound",
                },
            }
        ),
        submission_service=submitter,
    )

    result = service.execute(question="查看学生评论数量")

    assert result["status"] == "submitted"
    job = repo.get_by_id(result["query_id"])
    assert job is not None
    assert job.status == "QUEUED"
    assert job.route_type == QueryRouteType.AGENT_SEMANTIC.value
    assert job.semantic_plan_id == "plan_active_student_comments"
    assert job.resource_set_json == resource_set
    assert job.ticket_snapshot_json["semantic_plan_id"] == "plan_active_student_comments"
    assert job.governance_snapshot_json["query_dsl"]["dsl_version"] == "v1"
