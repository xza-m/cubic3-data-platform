from __future__ import annotations

from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.agent import create_agent_blueprint


class _AgentPlanHandlerStub:
    def handle(self, **kwargs):
        assert kwargs["runtime_options"]["runtime_mode"] == "official"
        return {
            "semantic_plan_id": "sp_api",
            "question": kwargs["question"],
            "runtime_mode": kwargs["runtime_options"]["runtime_mode"],
            "principal_context": kwargs["principal_context"],
            "business_intent": {"route_type": "cube"},
            "route": {"route_type": "cube"},
            "planning_steps": [],
            "compiled_targets": [],
            "policy_decision": {"decision": "allow"},
            "ticket_preview": {"type": "ticket_preview", "enforcement": "preview_only"},
            "traceability": {},
            "semantic_trace": {"semantic_plan_id": "sp_api"},
        }


def _build_client():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(create_agent_blueprint(_AgentPlanHandlerStub()))
    register_error_handlers(app)
    from tests.conftest import install_default_admin_auth

    return install_default_admin_auth(app.test_client(), roles=("admin", "finance"))


def test_agent_semantic_plan_api_returns_preview_only_ticket():
    client = _build_client()

    resp = client.post(
        "/api/v1/agent/semantic/plan",
        json={"question": "查看 GMV", "viewer_roles": ["finance"]},
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["semantic_plan_id"] == "sp_api"
    assert data["runtime_mode"] == "official"
    assert data["principal_context"]["roles"] == ["admin", "finance"]
    assert data["business_intent"]["route_type"] == "cube"
    assert data["ticket_preview"]["enforcement"] == "preview_only"
