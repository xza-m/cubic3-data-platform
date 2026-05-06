from flask import Flask

from app.interfaces.api.v1.semantic_modeling_agent import create_semantic_modeling_agent_blueprint


class _ModelingAgentStub:
    def __init__(self):
        self.calls = []

    def create_spec_draft(self, payload):
        self.calls.append(("spec_draft", payload))
        return {"spec": {"spec_version": "v1", "cube": {"name": "student_comments"}}}

    def draft_from_spec(self, spec):
        self.calls.append(("draft_from_spec", spec))
        return {"cube": {"name": "student_comments"}, "ontology": {"objects": [{"name": "student_comment"}]}}

    def validate(self, spec):
        self.calls.append(("validate", spec))
        return {"status": "ready", "issues": [], "agent_sandbox_preview": {"mode": "draft_spec"}}

    def apply(self, spec):
        self.calls.append(("apply", spec))
        return {"published": False, "assets": {"cube": {"name": "student_comments"}}}

    def publish(self, spec, publish_targets=None):
        self.calls.append(("publish", spec, publish_targets))
        return {"publish_targets": {"cube": True, "ontology": False}}

    def agent_ready_check(self, spec):
        self.calls.append(("agent_ready_check", spec))
        return {
            "status": "ready",
            "cube_status": "active",
            "ontology_status": "active",
            "bindings": {"metrics": []},
            "issues": [],
        }


def _client():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    builder = _ModelingAgentStub()
    app.register_blueprint(create_semantic_modeling_agent_blueprint(builder))
    return app.test_client(), builder


def test_modeling_agent_api_exposes_full_task_flow():
    client, builder = _client()

    spec_resp = client.post(
        "/api/v1/semantic/modeling-agent/spec-draft",
        json={"table": "dwd_student_comment_events", "business_subject": "学生评论"},
    )
    assert spec_resp.status_code == 200
    assert spec_resp.get_json()["data"]["spec"]["cube"]["name"] == "student_comments"

    for path in ["draft-from-spec", "validate", "apply", "agent-ready-check"]:
        resp = client.post(f"/api/v1/semantic/modeling-agent/{path}", json={"spec": {"spec_version": "v1"}})
        assert resp.status_code == 200

    publish_resp = client.post(
        "/api/v1/semantic/modeling-agent/publish",
        json={"spec": {"spec_version": "v1"}, "publish_targets": {"cube": True}},
    )
    assert publish_resp.status_code == 200
    assert publish_resp.get_json()["data"]["publish_targets"] == {"cube": True, "ontology": False}
    assert [call[0] for call in builder.calls] == [
        "spec_draft",
        "draft_from_spec",
        "validate",
        "apply",
        "agent_ready_check",
        "publish",
    ]


def test_modeling_agent_api_requires_spec_for_spec_based_steps():
    client, _ = _client()

    resp = client.post("/api/v1/semantic/modeling-agent/validate", json={})

    assert resp.status_code == 400
    assert "缺少必填字段: spec" in resp.get_json()["message"]
