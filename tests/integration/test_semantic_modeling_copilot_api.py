from flask import Flask

from app.extensions import db
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic_modeling_copilot import create_semantic_modeling_copilot_blueprint


class _CopilotStub:
    def __init__(self):
        self.calls = []

    def create_session(self, payload):
        self.calls.append(("create_session", payload))
        return {
            "id": "session_1",
            "entry_type": payload.get("entry_type", "business_question"),
            "workbench_state": {"agent_message": "ready"},
        }

    def get_session(self, session_id, *, principal_id=None):
        self.calls.append(("get_session", session_id, principal_id))
        return {"id": session_id, "workbench_state": {"agent_message": "ready"}}

    def get_review(self, session_id, *, principal_id=None):
        self.calls.append(("get_review", session_id, principal_id))
        return {
            "session_id": session_id,
            "proposal_id": None,
            "status": "drafting",
            "status_label": "等待生成 spec",
            "changes": [],
            "blockers": [],
            "reason_explanations": [],
            "data_agent_consumption": {
                "state": "unavailable",
                "label": "正式 Data Agent 暂不可消费",
                "reasons": ["SPEC_REQUIRED"],
            },
            "primary_action": {
                "action": "generate_spec",
                "label": "生成 spec",
                "disabled": False,
            },
        }

    def send_message(self, session_id, payload, *, principal_id=None):
        self.calls.append(("send_message", session_id, payload, principal_id))
        if session_id == "s_other_user":
            raise PermissionError("AgentSession s_other_user 属于其他用户，不能访问")
        return {
            "id": session_id,
            "workbench_state": {
                "agent_message": "已完成候选语义检索",
                "semantic_canvas": {"metrics": [{"name": "student_comment_count"}]},
            },
        }

    def confirm(self, session_id, payload, *, principal_id=None):
        self.calls.append(("confirm", session_id, payload, principal_id))
        return {"id": session_id, "working_memory": {"confirmed_assumptions": [payload]}}

    def accept_cube_draft(self, session_id, payload, *, principal_id=None):
        self.calls.append(("accept_cube_draft", session_id, payload, principal_id))
        return {
            "id": session_id,
            "workbench_state": {
                "cube_draft_accepted": True,
                "agent_message": "已接受 Cube 草稿，当前 spec 已锁定。",
            },
        }

    def sandbox(self, session_id, payload, *, principal_id=None):
        self.calls.append(("sandbox", session_id, payload, principal_id))
        return {"id": session_id, "workbench_state": {"sandbox_preview": {"pollutes_official_route": False}}}

    def save_proposal(self, session_id, payload, *, principal_id=None):
        self.calls.append(("save_proposal", session_id, payload, principal_id))
        return {"id": session_id, "current_proposal_id": "proposal_1"}

    def publish_proposal(self, session_id, payload, *, principal_id=None):
        self.calls.append(("publish_proposal", session_id, payload, principal_id))
        return {
            "id": session_id,
            "status": "completed",
            "current_proposal_id": "proposal_1",
            "workbench_state": {
                "publish_result": {"status": "published", "proposal_id": "proposal_1"},
                "readiness": {"canonical_ready": True, "exploratory_ready": True, "reasons": []},
            },
        }

    def update_spec(self, session_id, payload, *, principal_id=None):
        self.calls.append(("update_spec", session_id, payload, principal_id))
        merged_cube = (payload or {}).get("cube") or {}
        return {
            "id": session_id,
            "workbench_state": {
                "raw_spec": {"cube": merged_cube} if merged_cube else {},
                "validation_summary": [],
                "readiness": {"canonical_ready": False, "exploratory_ready": True, "reasons": ["ready_to_save"]},
                "agent_message": "已根据你的工作台编辑刷新 spec 与校验结果。",
            },
        }

    def list_sessions(self, principal_id=None, *, limit=50, offset=0, status=None, include_legacy=True):
        self.calls.append((
            "list_sessions",
            {
                "principal_id": principal_id,
                "limit": limit,
                "offset": offset,
                "status": status,
                "include_legacy": include_legacy,
            },
        ))
        items = [
            {"id": "s_alice_1", "principal_id": "alice", "title": "alice 草稿"},
            {"id": "s_legacy", "principal_id": None, "title": None},
        ]
        if not include_legacy:
            items = [it for it in items if it["principal_id"] is not None]
        if principal_id is not None:
            items = [
                it for it in items
                if it["principal_id"] is None or it["principal_id"] == principal_id
            ]
        return {"items": items, "total": len(items), "limit": limit, "offset": offset}

    def delete_session(self, session_id, *, principal_id=None):
        self.calls.append(("delete_session", session_id, principal_id))
        if session_id == "s_other_user":
            raise PermissionError("AgentSession s_other_user 属于其他用户，不能改写")
        return {"deleted": True, "id": session_id}

    def rename_session(self, session_id, payload, *, principal_id=None):
        self.calls.append(("rename_session", session_id, payload, principal_id))
        if session_id == "s_other_user":
            raise PermissionError("AgentSession s_other_user 属于其他用户，不能改写")
        return {"id": session_id, "title": payload.get("title")}


class _ErrorMappingStub(_CopilotStub):
    def get_session(self, session_id, *, principal_id=None):
        if session_id == "missing":
            raise LookupError("session not found")
        return super().get_session(session_id, principal_id=principal_id)

    def update_spec(self, session_id, payload, *, principal_id=None):
        raise ValueError("spec 缺少 cube")

    def publish_proposal(self, session_id, payload, *, principal_id=None):
        raise RuntimeError("database unavailable")


def _client():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    service = _CopilotStub()
    app.register_blueprint(create_semantic_modeling_copilot_blueprint(service))
    return app.test_client(), service


def _auth_client_with_roles(*roles, user_id="test_admin"):
    app = Flask(__name__)
    app.config.update(
        TESTING=False,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    with app.app_context():
        from app.infrastructure.access.models import (  # noqa: F401
            AccessApiKeyORM,
            AccessDelegationEventORM,
            AccessPrincipalAliasORM,
            AccessPrincipalORM,
            AccessRoleBindingORM,
            AccessServicePrincipalORM,
        )

        db.create_all()
    service = _CopilotStub()
    app.register_blueprint(create_semantic_modeling_copilot_blueprint(service))
    register_error_handlers(app)
    client = app.test_client()
    from tests.conftest import _make_jwt

    token = _make_jwt(user_id=user_id, user_name=user_id, roles=list(roles))
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return client, service


def test_modeling_copilot_api_exposes_session_first_flow():
    client, service = _client()

    create_resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions",
        json={"user_goal": "查询最近7天学生评论数，按学校汇总", "entry_type": "business_question"},
    )
    assert create_resp.status_code == 200
    session_id = create_resp.get_json()["data"]["id"]
    assert session_id == "session_1"

    message_resp = client.post(
        f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/messages",
        json={"message": "请先检索已有语义"},
    )
    assert message_resp.status_code == 200
    assert message_resp.get_json()["data"]["workbench_state"]["semantic_canvas"]["metrics"][0]["name"] == "student_comment_count"

    for action, body in [
        ("confirmations", {"confirmation_id": "confirm_school_dimension", "value": "school_id"}),
        ("sandbox", {}),
        ("save-proposal", {}),
    ]:
        resp = client.post(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/{action}", json=body)
        assert resp.status_code == 200

    get_resp = client.get(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}")
    assert get_resp.status_code == 200

    assert [call[0] for call in service.calls] == [
        "create_session",
        "send_message",
        "confirm",
        "sandbox",
        "save_proposal",
        "get_session",
    ]


def test_modeling_copilot_accepts_authenticated_viewer_proposal_flow():
    client, service = _auth_client_with_roles("viewer")

    resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions",
        json={"user_goal": "Data Agent 未命中学生评论业务语义", "entry_type": "semantic_gap"},
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["id"] == "session_1"
    assert service.calls[0][0] == "create_session"
    assert service.calls[0][1]["principal_id"] == "test_admin"


def test_modeling_copilot_create_session_uses_authenticated_principal_over_body():
    client, service = _auth_client_with_roles("viewer", user_id="alice")

    resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions",
        json={
            "user_goal": "Data Agent 未命中学生评论业务语义",
            "entry_type": "semantic_gap",
            "principal_id": "bob",
        },
    )

    assert resp.status_code == 200
    assert service.calls[0][0] == "create_session"
    assert service.calls[0][1]["principal_id"] == "alice"


def test_modeling_copilot_requires_login_outside_testing():
    app = Flask(__name__)
    app.config.update(TESTING=False)
    app.register_blueprint(create_semantic_modeling_copilot_blueprint(_CopilotStub()))
    register_error_handlers(app)

    resp = app.test_client().post(
        "/api/v1/semantic/modeling-copilot/sessions",
        json={"user_goal": "查询最近7天学生评论数，按学校汇总"},
    )

    assert resp.status_code == 401


def test_modeling_copilot_list_sessions_includes_legacy_by_default():
    client, service = _client()
    resp = client.get("/api/v1/semantic/modeling-copilot/sessions")
    assert resp.status_code == 200
    body = resp.get_json()["data"]
    ids = {item["id"] for item in body["items"]}
    assert ids == {"s_alice_1", "s_legacy"}
    assert service.calls[-1][0] == "list_sessions"
    assert service.calls[-1][1]["include_legacy"] is True


def test_modeling_copilot_list_sessions_can_exclude_legacy():
    client, _ = _client()
    resp = client.get(
        "/api/v1/semantic/modeling-copilot/sessions?include_legacy=false&limit=10",
    )
    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert {item["id"] for item in body["items"]} == {"s_alice_1"}
    assert body["limit"] == 10


def test_modeling_copilot_delete_session_returns_success():
    client, service = _client()
    resp = client.delete("/api/v1/semantic/modeling-copilot/sessions/s_target")
    assert resp.status_code == 200
    assert resp.get_json()["data"] == {"deleted": True, "id": "s_target"}
    assert service.calls[-1][0] == "delete_session"


def test_modeling_copilot_delete_session_forbidden_when_owned_by_others():
    client, _ = _client()
    resp = client.delete("/api/v1/semantic/modeling-copilot/sessions/s_other_user")
    assert resp.status_code == 403


def test_modeling_copilot_update_spec_endpoint_writes_cube():
    client, service = _client()
    resp = client.patch(
        "/api/v1/semantic/modeling-copilot/sessions/session_1/spec",
        json={"cube": {"name": "student_comment_cube", "source": "df.dwd_x"}},
    )
    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body["workbench_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert service.calls[-1][0] == "update_spec"


def test_modeling_copilot_accept_cube_draft_endpoint_is_state_action():
    client, service = _client()

    resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/session_1/accept-cube-draft",
        json={},
    )

    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body["workbench_state"]["cube_draft_accepted"] is True
    assert service.calls[-1][0] == "accept_cube_draft"


def test_modeling_copilot_review_endpoint_returns_artifact_view():
    client, service = _client()

    resp = client.get("/api/v1/semantic/modeling-copilot/sessions/session_1/review")

    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body["session_id"] == "session_1"
    assert body["status"] == "drafting"
    assert body["primary_action"]["action"] == "generate_spec"
    assert service.calls[-1][0] == "get_review"


def test_modeling_copilot_send_message_maps_agent_runtime_errors():
    """平台 runtime 不可用时返回 503，其它输出契约错误返回 422。"""
    from flask import Flask
    from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError

    class _RuntimeErrorStub:
        def create_session(self, payload):
            return {"id": "s_x", "user_goal": payload.get("user_goal")}

        def send_message(self, session_id, payload, *, principal_id=None):
            if session_id == "s_contract":
                raise AgentInferenceRuntimeError(
                    "runtime 输出不符合 schema",
                    code="RUNTIME_INVALID_OUTPUT",
                    details={"field": "message"},
                )
            raise AgentInferenceRuntimeError(
                "未配置平台 Agent Runtime",
                code="RUNTIME_NOT_CONFIGURED",
                details={"runtime_name": "openai_compatible"},
            )

    app = Flask(__name__)
    app.config.update(TESTING=True)
    app.register_blueprint(create_semantic_modeling_copilot_blueprint(_RuntimeErrorStub()))
    client = app.test_client()

    resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/s_x/messages",
        json={"message": "hi"},
    )
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["details"]["code"] == "RUNTIME_NOT_CONFIGURED"
    assert body["details"]["runtime_name"] == "openai_compatible"

    contract_resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/s_contract/messages",
        json={"message": "hi"},
    )
    assert contract_resp.status_code == 422
    contract_body = contract_resp.get_json()
    assert contract_body["details"]["code"] == "RUNTIME_INVALID_OUTPUT"
    assert contract_body["details"]["field"] == "message"


def test_modeling_copilot_authenticated_session_paths_pass_current_principal():
    client, service = _auth_client_with_roles("viewer", user_id="alice")

    session_id = "session_1"
    client.get(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}")
    client.get(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/review")
    client.post(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/messages", json={"message": "继续"})
    client.post(
        f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/confirmations",
        json={"confirmation_id": "confirm_school_dimension", "value": "school_id"},
    )
    client.post(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/accept-cube-draft", json={})
    client.post(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/sandbox", json={})
    client.patch(
        f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/spec",
        json={"cube": {"name": "student_comment_cube"}},
    )
    client.post(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/save-proposal", json={})
    client.post(f"/api/v1/semantic/modeling-copilot/sessions/{session_id}/publish", json={})

    assert [call for call in service.calls if call[0] != "create_session"] == [
        ("get_session", session_id, "alice"),
        ("get_review", session_id, "alice"),
        ("send_message", session_id, {"message": "继续"}, "alice"),
        ("confirm", session_id, {"confirmation_id": "confirm_school_dimension", "value": "school_id"}, "alice"),
        ("accept_cube_draft", session_id, {}, "alice"),
        ("sandbox", session_id, {}, "alice"),
        ("update_spec", session_id, {"cube": {"name": "student_comment_cube"}}, "alice"),
        ("save_proposal", session_id, {}, "alice"),
        ("publish_proposal", session_id, {}, "alice"),
    ]


def test_modeling_copilot_cross_user_permission_error_returns_403():
    client, _ = _auth_client_with_roles("viewer", user_id="alice")

    resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/s_other_user/messages",
        json={"message": "继续"},
    )

    assert resp.status_code == 403


def test_modeling_copilot_publish_endpoint_chains_full_publish():
    client, service = _client()
    resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/session_1/publish",
        json={"comment": "Copilot 一键发布"},
    )
    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body["status"] == "completed"
    assert body["workbench_state"]["publish_result"]["status"] == "published"
    assert service.calls[-1][0] == "publish_proposal"


def test_modeling_copilot_rename_session_updates_title():
    client, service = _client()
    resp = client.patch(
        "/api/v1/semantic/modeling-copilot/sessions/s_target",
        json={"title": "新标题"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["data"] == {"id": "s_target", "title": "新标题"}
    assert service.calls[-1][0] == "rename_session"


def test_modeling_copilot_api_maps_not_found_validation_and_internal_errors():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    app.register_blueprint(create_semantic_modeling_copilot_blueprint(_ErrorMappingStub()))
    client = app.test_client()

    missing_resp = client.get("/api/v1/semantic/modeling-copilot/sessions/missing")
    assert missing_resp.status_code == 404
    assert missing_resp.get_json()["details"]["code"] == "COPILOT_NOT_FOUND"

    invalid_resp = client.patch(
        "/api/v1/semantic/modeling-copilot/sessions/session_1/spec",
        json={"cube": {}},
    )
    assert invalid_resp.status_code == 422
    assert invalid_resp.get_json()["details"]["code"] == "COPILOT_VALIDATION_ERROR"

    internal_resp = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/session_1/publish",
        json={},
    )
    assert internal_resp.status_code == 500
    assert internal_resp.get_json()["details"]["code"] == "COPILOT_INTERNAL_ERROR"
