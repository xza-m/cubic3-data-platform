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


def _build_client(execute_service, gateway_token: str = "test-gateway-token"):
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN=gateway_token,
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


def test_agent_semantic_execute_returns_structured_503_when_token_missing():
    """Phase 5：token 未配置时 503 payload 结构化为 {error_code, hint}，前端可给出配置指引。"""
    service = _AgentGatewayExecuteServiceStub({"status": "submitted"})
    client = _build_client(service, gateway_token="")

    response = client.post("/api/v1/agent/semantic/execute", json={"question": "查看昨日 GMV"})

    assert response.status_code == 503
    payload = response.get_json()
    assert payload["details"]["error_code"] == "gateway_token_missing"
    assert "QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN" in payload["details"]["hint"]
    assert service.calls == []


def test_agent_semantic_execute_returns_structured_503_when_gateway_unavailable():
    """gateway 不可达时 503 payload 携带 error_code=gateway_unavailable 与 hint。"""
    from app.infrastructure.gateway.telemetry_client import GatewayQueryError

    class _FailingService:
        def execute(self, **kwargs):
            raise GatewayQueryError("gateway query failed: 502")

    client = _build_client(_FailingService())

    response = client.post("/api/v1/agent/semantic/execute", json={"question": "查看昨日 GMV"})

    assert response.status_code == 503
    payload = response.get_json()
    assert payload["details"]["error_code"] == "gateway_unavailable"
    assert "dw-query-gateway" in payload["details"]["hint"]


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
