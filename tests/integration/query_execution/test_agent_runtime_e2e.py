from __future__ import annotations

from flask import Flask
import pytest

from app.application.query_execution.agent_execute_service import AgentSemanticExecuteService
from app.application.query_execution.result_service import QueryResultService
from app.application.query_execution.sql_guard import SqlGuard
from app.application.query_execution.submission_service import QuerySubmissionService
from app.application.query_execution.ticket_service import ExecutionTicketService
from app.application.query_execution.worker_service import QueryExecutionWorkerService
from app.extensions import db
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.infrastructure.query_execution.result_store import LocalSpoolResultStore
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.agent import create_agent_blueprint
from app.interfaces.api.v1.query_execution import create_query_execution_blueprint
from tests.conftest import _make_jwt, install_default_admin_auth


class _PublishedSemanticCatalog:
    """测试用已发布语义资产；物理表字段只出现在 Cube 技术语义中。"""

    def __init__(self):
        self.cube = {
            "name": "student_comment_cube",
            "status": "active",
            "table": "df_cb_258187.dwd_interaction_comment_reports_df",
            "dimensions": {
                "school": {"name": "school_name", "column": "comment_school_name"},
                "comment_time": {"name": "comment_published_at", "column": "comment_published_at"},
            },
            "measures": {
                "comment_count": {"name": "comment_count", "expression": "COUNT(DISTINCT comment_id)"},
            },
            "restricted_fields": [
                "comment_content",
                "parent_content",
                "reference_content",
                "study_content",
            ],
        }
        self.ontology = {
            "object": {"name": "StudentComment", "type": "BusinessObject", "status": "active"},
            "metric": {
                "name": "comment_count",
                "type": "BusinessMetric",
                "status": "active",
                "measure_ref": "student_comment_cube.comment_count",
                "default_dimension_refs": ["student_comment_cube.school_name"],
            },
        }

    def compile_comment_count_plan(self, *, principal_context: dict):
        measure = self.cube["measures"]["comment_count"]
        logical_sql = f"SELECT {measure['expression']} AS comment_cnt FROM {self.cube['table']}"
        return {
            "semantic_plan_id": "plan_student_comment_e2e",
            "principal_context": principal_context,
            "policy_decision": {"decision": "allow"},
            "compiled_targets": [
                {
                    "status": "ready",
                    "target_type": "sql",
                    "logical_sql": logical_sql,
                    "query_dsl": {
                        "dsl_version": "v1",
                        "measures": ["student_comment_cube.comment_count"],
                    },
                    "sql_hash": "hash-student-comment-e2e",
                    "resource_set": {
                        "ontology": [dict(self.ontology["metric"])],
                        "cubes": [self._cube_resource()],
                    },
                    "data_level": "M1",
                    "execution_request": {
                        "source_id": 1,
                        "sql_query": logical_sql,
                    },
                }
            ],
            "semantic_trace": {
                "route": "active_ontology",
                "binding_status": "bound",
                "cube_status": "active",
            },
        }

    def compile_student_comment_by_school_plan(self, *, principal_context: dict):
        metric = self.ontology["metric"]
        measure = self.cube["measures"]["comment_count"]
        school_dimension = self.cube["dimensions"]["school"]
        time_dimension = self.cube["dimensions"]["comment_time"]
        logical_sql = (
            f"SELECT {school_dimension['column']} AS {school_dimension['name']}, "
            f"{measure['expression']} AS {metric['name']} "
            f"FROM {self.cube['table']} "
            f"WHERE {time_dimension['column']} >= CURRENT_DATE - INTERVAL '7' DAY "
            f"GROUP BY {school_dimension['column']} "
            f"ORDER BY {metric['name']} DESC"
        )
        return {
            "semantic_plan_id": "plan_student_comment_by_school_7d",
            "principal_context": principal_context,
            "business_intent": {
                "object": self.ontology["object"]["name"],
                "metric": metric["name"],
                "time_window": "last_7_days",
                "grain": "school",
            },
            "policy_decision": {"decision": "allow"},
            "compiled_targets": [
                {
                    "status": "ready",
                    "target_type": "sql",
                    "logical_sql": logical_sql,
                    "query_dsl": {
                        "dsl_version": "v1",
                        "measures": ["student_comment_cube.comment_count"],
                        "dimensions": ["student_comment_cube.school_name"],
                        "time_dimensions": [
                            {
                                "dimension": "student_comment_cube.comment_published_at",
                                "date_range": ["__last_7_days_start__", "__today__"],
                            }
                        ],
                        "order": [["student_comment_cube.comment_count", "desc"]],
                        "limit": 100,
                    },
                    "sql_hash": "hash-student-comment-by-school-7d",
                    "resource_set": {
                        "ontology": [
                            dict(self.ontology["object"]),
                            dict(metric),
                        ],
                        "cubes": [self._cube_resource()],
                    },
                    "data_level": "M1",
                    "execution_request": {
                        "source_id": 1,
                        "sql_query": logical_sql,
                    },
                    "bindings": {
                        "metric": metric["name"],
                        "measure_ref": metric["measure_ref"],
                        "dimension_refs": list(metric["default_dimension_refs"]),
                    },
                }
            ],
            "semantic_trace": {
                "route": "active_ontology",
                "binding_status": "bound",
                "cube_status": "active",
                "projection_result": {
                    "exposed_fields": [school_dimension["name"], metric["name"]],
                    "restricted_fields": list(self.cube["restricted_fields"]),
                },
                "resolved_bindings": {
                    metric["name"]: metric["measure_ref"],
                    school_dimension["name"]: "student_comment_cube.school_name",
                },
            },
        }

    def _cube_resource(self):
        return {"name": self.cube["name"], "status": self.cube["status"]}


class _AgentFirstPlanHandler:
    """模拟已发布 Ontology + active Cube 编译后的 official plan。"""

    def __init__(self, catalog: _PublishedSemanticCatalog | None = None):
        self.calls = []
        self.catalog = catalog or _PublishedSemanticCatalog()

    def handle(self, **kwargs):
        self.calls.append(kwargs)
        assert kwargs["runtime_options"]["runtime_mode"] == "official"
        question = kwargs.get("question") or ""
        if "最近7天" in question and "学校" in question:
            return self.catalog.compile_student_comment_by_school_plan(
                principal_context=kwargs["principal_context"],
            )
        return self.catalog.compile_comment_count_plan(
            principal_context=kwargs["principal_context"],
        )


class _WarehouseAdapter:
    def __init__(self):
        self.submitted_sql = []

    def submit(self, *, source_id: int, sql: str) -> str:
        self.submitted_sql.append((source_id, sql))
        if "dwd_interaction_comment_reports_df" in sql and "school_name" in sql:
            return "engine_student_comment_by_school_7d"
        return "engine_student_comment_e2e"

    def get_status(self, engine_query_id: str) -> str:
        assert engine_query_id in {
            "engine_student_comment_e2e",
            "engine_student_comment_by_school_7d",
        }
        return "SUCCEEDED"

    def fetch_result(self, engine_query_id: str):
        if engine_query_id == "engine_student_comment_by_school_7d":
            return {
                "columns": ["school_name", "comment_count"],
                "rows": [
                    {"school_name": "第一实验学校", "comment_count": 31},
                    {"school_name": "第二实验学校", "comment_count": 11},
                ],
            }
        assert engine_query_id == "engine_student_comment_e2e"
        return {
            "columns": ["comment_cnt"],
            "rows": [{"comment_cnt": 42}],
        }

    def cancel(self, engine_query_id: str) -> None:
        raise AssertionError(f"unexpected cancel: {engine_query_id}")


def _build_agent_runtime_e2e_app(tmp_path):
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        JWT_SECRET="your-secret-key",
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    with app.app_context():
        db.create_all()

        repository = QueryExecutionRepository(db.session)
        ticket_service = ExecutionTicketService(default_ttl_seconds=300)
        submission_service = QuerySubmissionService(
            repository=repository,
            sql_guard=SqlGuard(default_limit=50000),
            ticket_service=ticket_service,
        )
        result_service = QueryResultService(repository=repository)
        plan_handler = _AgentFirstPlanHandler()
        warehouse_adapter = _WarehouseAdapter()
        agent_execute_service = AgentSemanticExecuteService(
            plan_handler=plan_handler,
            submission_service=submission_service,
        )
        worker_service = QueryExecutionWorkerService(
            repository=repository,
            ticket_service=ticket_service,
            adapter=warehouse_adapter,
            result_store=LocalSpoolResultStore(spool_dir=tmp_path),
        )

        app.register_blueprint(create_agent_blueprint(plan_handler, agent_execute_service))
        app.register_blueprint(create_query_execution_blueprint(submission_service, result_service))
        register_error_handlers(app)
        app.extensions["agent_runtime_e2e"] = {
            "plan_handler": plan_handler,
            "worker_service": worker_service,
            "repository": repository,
            "warehouse_adapter": warehouse_adapter,
        }
    return app


def _install_auth(test_client, *, user_id: str, user_name: str, roles: tuple[str, ...]):
    token = _make_jwt(user_id=user_id, user_name=user_name, roles=list(roles))
    test_client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return test_client


@pytest.fixture
def agent_runtime_e2e_app(tmp_path):
    app = _build_agent_runtime_e2e_app(tmp_path)
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_agent_first_runtime_http_execute_worker_and_result_e2e(agent_runtime_e2e_app):
    app = agent_runtime_e2e_app
    client = install_default_admin_auth(app.test_client(), roles=("admin", "analyst"))

    executed = client.post(
        "/api/v1/agent/semantic/execute",
        json={
            "question": "查看学生评论数量",
            "viewer_roles": ["analyst"],
            "idempotency_key": "agent-runtime-e2e",
        },
    )

    assert executed.status_code == 200
    execute_payload = executed.get_json()["data"]
    assert execute_payload["status"] == "submitted"
    assert execute_payload["poll_url"].startswith("/api/v1/query-execution/jobs/")
    assert execute_payload["result_url"].endswith("/results")
    assert execute_payload["semantic_trace"]["binding_status"] == "bound"

    query_id = execute_payload["query_id"]
    with app.app_context():
        job = app.extensions["agent_runtime_e2e"]["worker_service"].process_next(
            worker_id="agent-runtime-e2e-worker",
        )
        assert job.id == query_id
        assert job.status == "SUCCEEDED"

    status = client.get(execute_payload["poll_url"])
    assert status.status_code == 200
    status_payload = status.get_json()["data"]
    assert status_payload["status"] == "SUCCEEDED"
    assert status_payload["engine_query_id"] == "engine_student_comment_e2e"

    events = client.get(f"/api/v1/query-execution/jobs/{query_id}/events")
    assert events.status_code == 200
    event_types = [item["event_type"] for item in events.get_json()["data"]["items"]]
    assert event_types == [
        "job_created",
        "job_claimed",
        "job_submitting",
        "job_running",
        "job_fetching",
        "job_persisting",
        "job_succeeded",
    ]

    result = client.get(execute_payload["result_url"])
    assert result.status_code == 200
    result_payload = result.get_json()["data"]
    assert result_payload["status"] == "READY"
    assert result_payload["row_count"] == 1
    assert result_payload["preview"]["columns"] == ["comment_cnt"]
    assert result_payload["preview"]["rows"] == [{"comment_cnt": 42}]

    with app.app_context():
        repository = app.extensions["agent_runtime_e2e"]["repository"]
        stored_job = repository.get_by_id(query_id)
        assert stored_job.semantic_plan_id == "plan_student_comment_e2e"
        assert stored_job.route_type == "agent_semantic"
        assert stored_job.ticket_snapshot_json["semantic_plan_id"] == "plan_student_comment_e2e"
        assert stored_job.resource_set_json["ontology"][0]["status"] == "active"


def test_agent_first_runtime_student_comment_by_school_acceptance(agent_runtime_e2e_app):
    app = agent_runtime_e2e_app
    client = _install_auth(
        app.test_client(),
        user_id="data_agent_test",
        user_name="Data Agent Test",
        roles=("ops_readonly",),
    )

    executed = client.post(
        "/api/v1/agent/semantic/execute",
        json={
            "question": "查询最近7天学生评论数，按学校汇总",
            "principal_context": {
                "principal_id": "data_agent_test",
                "display_name": "Data Agent Test",
                "roles": ["ops_readonly"],
            },
            "viewer_roles": ["ops_readonly"],
            "idempotency_key": "student-comment-by-school-7d",
        },
    )

    assert executed.status_code == 200
    execute_payload = executed.get_json()["data"]
    assert execute_payload["status"] == "submitted"
    assert execute_payload["semantic_trace"]["route"] == "active_ontology"
    assert execute_payload["semantic_trace"]["binding_status"] == "bound"

    query_id = execute_payload["query_id"]
    with app.app_context():
        job = app.extensions["agent_runtime_e2e"]["worker_service"].process_next(
            worker_id="student-comment-by-school-worker",
        )
        assert job.id == query_id
        assert job.status == "SUCCEEDED"

    result = client.get(execute_payload["result_url"])
    assert result.status_code == 200
    result_payload = result.get_json()["data"]
    assert result_payload["status"] == "READY"
    assert result_payload["preview"]["columns"] == ["school_name", "comment_count"]
    assert result_payload["preview"]["rows"] == [
        {"school_name": "第一实验学校", "comment_count": 31},
        {"school_name": "第二实验学校", "comment_count": 11},
    ]

    restricted_fields = {"student_name", "student_mobile", "comment_content"}
    result_columns = set(result_payload["preview"]["columns"])
    assert restricted_fields.isdisjoint(result_columns)

    with app.app_context():
        repository = app.extensions["agent_runtime_e2e"]["repository"]
        stored_job = repository.get_by_id(query_id)
        assert stored_job.principal_id == "data_agent_test"
        assert stored_job.semantic_plan_id == "plan_student_comment_by_school_7d"
        assert stored_job.route_type == "agent_semantic"
        assert stored_job.resource_set_json["cubes"][0]["name"] == "student_comment_cube"
        assert stored_job.ticket_snapshot_json["principal_id"] == "data_agent_test"
        executed_sql = stored_job.validated_sql.lower()
        assert "df_cb_258187.dwd_interaction_comment_reports_df" in executed_sql
        assert "group by comment_school_name" in executed_sql
        assert "comment_published_at" in executed_sql
        assert all(field not in executed_sql for field in restricted_fields)
