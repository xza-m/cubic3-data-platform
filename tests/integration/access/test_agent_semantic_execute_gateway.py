from __future__ import annotations

from flask import Flask

from app.extensions import db
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.agent import create_agent_blueprint
from tests.conftest import install_default_admin_auth


class _AgentPlanHandlerStub:
    def handle(self, **kwargs):
        return {"semantic_plan_id": "sp_gateway", "question": kwargs["question"]}


class _AgentGatewayExecuteServiceStub:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def execute(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


def _build_client(execute_service):
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    app.register_blueprint(create_agent_blueprint(_AgentPlanHandlerStub(), execute_service))
    register_error_handlers(app)
    return install_default_admin_auth(app.test_client(), roles=("admin", "data_m1_reader"))


def test_agent_semantic_execute_submits_to_gateway_contract():
    service = _AgentGatewayExecuteServiceStub(
        {
            "status": "submitted",
            "gateway_query_id": "qry-gateway-1",
            "gateway": {"query_id": "qry-gateway-1", "status": "QUEUED"},
            "policy_decision": {"decision": "allow"},
        }
    )
    client = _build_client(service)

    response = client.post(
        "/api/v1/agent/semantic/execute",
        json={"question": "查看昨日 GMV", "idempotency_key": "idem-1"},
    )

    assert response.status_code == 202
    payload = response.get_json()["data"]
    assert payload["gateway_query_id"] == "qry-gateway-1"
    assert "query_execution_job_id" not in payload
    assert "query_id" not in payload
    assert service.calls[0]["idempotency_key"] == "idem-1"


def test_agent_semantic_execute_denied_policy_does_not_create_local_job():
    service = _AgentGatewayExecuteServiceStub(
        {
            "status": "blocked",
            "decision": "deny",
            "policy_decision": {"decision": "deny", "reason_code": "data_policy_not_matched"},
        }
    )
    client = _build_client(service)

    response = client.post("/api/v1/agent/semantic/execute", json={"question": "查看明细订单"})

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["status"] == "blocked"
    assert payload["policy_decision"]["reason_code"] == "data_policy_not_matched"
    assert "query_execution_job_id" not in payload
