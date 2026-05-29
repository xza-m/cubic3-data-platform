from __future__ import annotations

from dataclasses import dataclass

import jwt
from flask import Flask, g

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.agent_runtime import create_agent_runtime_blueprint


@dataclass(frozen=True)
class _RepositoryArtifact:
    artifact_id: str
    run_id: str
    artifact_type: str
    title: str
    summary: str
    mime_type: str
    size_bytes: int
    sha256: str


class _Repo:
    def __init__(self) -> None:
        self.artifact_principal_ids: list[str | None] = []
        self.get_run_ids: list[str] = []

    def get_run(self, run_id: str):
        self.get_run_ids.append(run_id)
        if run_id == "run_object":
            return _RunObject()
        if run_id == "run_unowned":
            return AgentInferenceRuntimeRun(
                run_id="run_unowned",
                app_id="semantic_modeling",
                action="semantic.modeling.chat",
                runtime_name="openai_compatible",
                status="succeeded",
                runtime_context_ref=RuntimeContextRef(
                    project_id="cubic3-data-platform",
                    session_id="s_unowned",
                    thread_id="t_unowned",
                    turn_id="turn_unowned",
                ),
                principal_id=None,
                provider_ref={"provider_run_id": "provider_unowned"},
                usage={"total_tokens": 1},
                error=None,
            )
        if run_id != "run_1":
            return None
        return AgentInferenceRuntimeRun(
            run_id="run_1",
            app_id="semantic_modeling",
            action="semantic.modeling.chat",
            runtime_name="openai_compatible",
            status="succeeded",
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id="s1",
                thread_id="t1",
                turn_id="turn1",
            ),
            principal_id="alice",
            provider_ref={"provider_run_id": "provider_1"},
            usage={"total_tokens": 7},
            error=None,
        )

    def list_artifacts(self, *, run_id: str, principal_id: str | None):
        self.artifact_principal_ids.append(principal_id)
        if run_id == "run_object":
            return [
                _RepositoryArtifact(
                    artifact_id="artifact_obj",
                    run_id="run_object",
                    artifact_type="codex_workspace",
                    title="工作区摘要",
                    summary="来自仓储对象",
                    mime_type="application/json",
                    size_bytes=17,
                    sha256="sha-object",
                )
            ]
        return [
            AgentInferenceRuntimeArtifact(
                artifact_id="artifact_1",
                run_id=run_id,
                artifact_type="model_patch",
                title="建模补丁",
                summary="候选语义模型 patch",
                mime_type="application/json",
                size_bytes=42,
                sha256="sha-1",
            )
        ]


class _ContextRefObject:
    project_id = "cubic3-data-platform"
    session_id = "s2"
    thread_id = "t2"
    turn_id = "turn2"


class _RunObject:
    run_id = "run_object"
    app_id = "semantic_modeling"
    action = "semantic.modeling.review_proposal"
    runtime_name = "codex_app_server"
    status = "failed"
    runtime_context_ref = _ContextRefObject()
    principal_id = "bob"
    provider_ref = {"thread_id": "codex_thread_1"}
    usage = {"input_tokens": 3}
    error = {"code": "CODEX_RUNTIME_UNAVAILABLE"}


class _RepoProvider:
    def __init__(self, repos: list[_Repo]) -> None:
        self.repos = repos
        self.calls = 0

    def __call__(self) -> _Repo:
        repo = self.repos[self.calls]
        self.calls += 1
        return repo


class _RuntimeManagement:
    def __init__(self) -> None:
        self.tested: list[str] = []
        self.started: list[str] = []
        self.stopped: list[str] = []

    def snapshot(self):
        return {
            "providers": [
                {
                    "runtime_name": "openai_compatible",
                    "label": "OpenAI Runtime",
                    "configured": True,
                    "available": True,
                    "status": "ready",
                    "message": "OpenAI Runtime 已配置。",
                    "operations": ["test_connection"],
                    "details": {"model": "gpt-4o-mini"},
                },
                {
                    "runtime_name": "codex_app_server",
                    "label": "Codex App Server",
                    "configured": False,
                    "available": False,
                    "status": "disabled",
                    "message": "Codex app-server 未启用。",
                    "operations": [],
                    "details": {"ui_managed": False},
                },
            ],
            "action_bindings": [
                {
                    "action": "semantic.modeling.generate_candidates",
                    "default_runtime": "openai_compatible",
                    "allowed_runtimes": ["openai_compatible"],
                    "expose_selector": False,
                    "requires_connection": False,
                    "reason": "fixed_openai_low_latency",
                },
                {
                    "action": "semantic.modeling.review_proposal",
                    "default_runtime": "codex_app_server",
                    "allowed_runtimes": ["codex_app_server"],
                    "expose_selector": False,
                    "requires_connection": True,
                    "reason": "fixed_codex_workspace",
                },
            ],
        }

    def resolve_action(self, action: str):
        if action == "semantic.modeling.review_proposal":
            return self.snapshot()["action_bindings"][1]
        return self.snapshot()["action_bindings"][0]

    def test_provider(self, runtime_name: str):
        self.tested.append(runtime_name)
        if runtime_name == "missing":
            raise KeyError(runtime_name)
        return self.snapshot()["providers"][0]

    def start_provider(self, runtime_name: str):
        self.started.append(runtime_name)
        return {
            "runtime_name": runtime_name,
            "operation": "start",
            "status": "succeeded",
            "message": "已提交 Codex app-server 启动。",
            "details": {"pid": 4321},
        }

    def stop_provider(self, runtime_name: str):
        self.stopped.append(runtime_name)
        return {
            "runtime_name": runtime_name,
            "operation": "stop",
            "status": "succeeded",
            "message": "已停止 Codex app-server。",
            "details": {"pid": 4321},
        }

    def restart_provider(self, runtime_name: str):
        return {
            "runtime_name": runtime_name,
            "operation": "restart",
            "status": "succeeded",
            "message": "已重启 Codex app-server。",
            "details": {"pid": 4322},
        }

    def provider_logs(self, runtime_name: str):
        return {
            "runtime_name": runtime_name,
            "log_path": "/tmp/codex.log",
            "lines": ["ready"],
            "truncated": False,
        }

    def provider_capabilities(self, runtime_name: str):
        return {
            "runtime_name": runtime_name,
            "available": True,
            "actions": ["review", "repair", "audit"],
            "artifacts": ["model_patch"],
            "events": ["run.started", "run.succeeded"],
            "details": {},
        }


def _client(
    repository_provider,
    *,
    principal_id: str | None = "alice",
    testing: bool = True,
    runtime_management_provider=None,
):
    app = Flask(__name__)
    app.config.update(TESTING=testing, JWT_SECRET="test-secret")
    register_error_handlers(app)

    if testing and principal_id is not None:
        @app.before_request
        def _inject_principal():
            g.principal_id = principal_id

    app.register_blueprint(
        create_agent_runtime_blueprint(
            repository_provider,
            runtime_management_provider=runtime_management_provider,
        )
    )
    return app.test_client()


def test_agent_runtime_api_returns_run_detail():
    resp = _client(lambda: _Repo()).get("/api/v1/agent-runtime/runs/run_1")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["run_id"] == "run_1"
    assert data["runtime_name"] == "openai_compatible"
    assert data["runtime_context_ref"]["turn_id"] == "turn1"
    assert data["provider_ref"]["provider_run_id"] == "provider_1"
    assert data["usage"]["total_tokens"] == 7


def test_agent_runtime_api_returns_not_found_code():
    resp = _client(lambda: _Repo()).get("/api/v1/agent-runtime/runs/missing")

    assert resp.status_code == 404
    body = resp.get_json()
    assert body["code"] == -1
    assert body["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"


def test_agent_runtime_api_returns_artifacts_and_passes_principal_id():
    repo = _Repo()

    resp = _client(lambda: repo).get("/api/v1/agent-runtime/runs/run_1/artifacts")

    assert resp.status_code == 200
    assert repo.artifact_principal_ids == ["alice"]
    data = resp.get_json()["data"]
    assert data["items"] == [
        {
            "artifact_id": "artifact_1",
            "run_id": "run_1",
            "artifact_type": "model_patch",
            "title": "建模补丁",
            "summary": "候选语义模型 patch",
            "mime_type": "application/json",
            "size_bytes": 42,
            "sha256": "sha-1",
        }
    ]


def test_agent_runtime_api_serializes_repository_returned_objects():
    resp = _client(lambda: _Repo(), principal_id="bob").get(
        "/api/v1/agent-runtime/runs/run_object"
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["runtime_name"] == "codex_app_server"
    assert data["runtime_context_ref"]["session_id"] == "s2"
    assert data["error"]["code"] == "CODEX_RUNTIME_UNAVAILABLE"

    artifacts_resp = _client(lambda: _Repo(), principal_id="bob").get(
        "/api/v1/agent-runtime/runs/run_object/artifacts"
    )
    assert artifacts_resp.status_code == 200
    assert artifacts_resp.get_json()["data"]["items"][0]["artifact_id"] == "artifact_obj"


def test_agent_runtime_api_hides_cross_user_run_to_prevent_enumeration():
    resp = _client(lambda: _Repo(), principal_id="mallory").get(
        "/api/v1/agent-runtime/runs/run_1"
    )

    assert resp.status_code == 404
    assert resp.get_json()["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"


def test_agent_runtime_api_hides_cross_user_artifacts_before_listing():
    repo = _Repo()

    resp = _client(lambda: repo, principal_id="mallory").get(
        "/api/v1/agent-runtime/runs/run_1/artifacts"
    )

    assert resp.status_code == 404
    assert resp.get_json()["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"
    assert repo.artifact_principal_ids == []


def test_agent_runtime_api_requires_identity_outside_testing():
    resp = _client(lambda: _Repo(), principal_id=None, testing=False).get(
        "/api/v1/agent-runtime/runs/run_1"
    )

    assert resp.status_code == 401
    assert resp.get_json()["error_code"] == "MISSING_TOKEN"


def test_agent_runtime_api_accepts_authenticated_principal_outside_testing():
    token = jwt.encode(
        {"user_id": "u1", "principal_id": "alice", "user_name": "Alice"},
        "test-secret",
        algorithm="HS256",
    )

    resp = _client(lambda: _Repo(), principal_id=None, testing=False).get(
        "/api/v1/agent-runtime/runs/run_1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["principal_id"] == "alice"


def test_agent_runtime_api_rejects_signed_token_without_principal_for_unowned_run():
    token = jwt.encode(
        {"user_name": "No Principal", "roles": ["viewer"]},
        "test-secret",
        algorithm="HS256",
    )

    resp = _client(lambda: _Repo(), principal_id=None, testing=False).get(
        "/api/v1/agent-runtime/runs/run_unowned",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 401
    assert resp.get_json()["error_code"] == "MISSING_PRINCIPAL"


def test_agent_runtime_api_uses_repository_provider_per_request():
    repos = [_Repo(), _Repo()]
    provider = _RepoProvider(repos)
    client = _client(provider)

    assert provider.calls == 0
    client.get("/api/v1/agent-runtime/runs/run_1")
    client.get("/api/v1/agent-runtime/runs/run_1")

    assert provider.calls == 2
    assert repos[0].get_run_ids == ["run_1"]
    assert repos[1].get_run_ids == ["run_1"]


def test_agent_runtime_api_exposes_platform_runtime_management_snapshot():
    runtime_management = _RuntimeManagement()

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).get("/api/v1/agent-runtime/providers/status")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["providers"][0]["runtime_name"] == "openai_compatible"
    assert data["providers"][1]["runtime_name"] == "codex_app_server"
    assert data["action_bindings"][0]["expose_selector"] is False


def test_agent_runtime_api_resolves_action_binding_without_frontend_runtime_switching():
    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: _RuntimeManagement(),
    ).get("/api/v1/agent-runtime/actions/semantic.modeling.review_proposal/binding")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["default_runtime"] == "codex_app_server"
    assert data["expose_selector"] is False
    assert data["requires_connection"] is True


def test_agent_runtime_api_tests_provider_via_management_service():
    runtime_management = _RuntimeManagement()

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).post("/api/v1/agent-runtime/providers/openai_compatible/test")

    assert resp.status_code == 200
    assert runtime_management.tested == ["openai_compatible"]
    assert resp.get_json()["data"]["status"] == "ready"


def test_agent_runtime_api_starts_codex_without_accepting_frontend_command():
    runtime_management = _RuntimeManagement()

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).post(
        "/api/v1/agent-runtime/providers/codex_app_server/start",
        json={"command": "rm -rf /"},
    )

    assert resp.status_code == 200
    assert runtime_management.started == ["codex_app_server"]
    assert resp.get_json()["data"]["details"]["pid"] == 4321


def test_agent_runtime_api_exposes_codex_logs_and_capabilities():
    client = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: _RuntimeManagement(),
    )

    logs_resp = client.get("/api/v1/agent-runtime/providers/codex_app_server/logs")
    capabilities_resp = client.get("/api/v1/agent-runtime/providers/codex_app_server/capabilities")

    assert logs_resp.status_code == 200
    assert logs_resp.get_json()["data"]["lines"] == ["ready"]
    assert capabilities_resp.status_code == 200
    assert "review" in capabilities_resp.get_json()["data"]["actions"]
