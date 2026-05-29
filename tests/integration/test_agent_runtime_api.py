from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from flask import Flask, g

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeManagementAuditEvent,
    RuntimeOperationResult,
    RuntimeProviderConfigSnapshot,
    RuntimeContextRef,
)
from app.application.agent_inference_runtime.management import AgentRuntimeManagementService
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
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
        self.audit_events: list[dict[str, str | None]] = []

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

    def provider_config(self, runtime_name: str):
        return {
            "runtime_name": runtime_name,
            "enabled": True,
            "endpoint": "https://api.openai.com/v1",
            "model": "gpt-5.1",
            "api_key": "********",
            "extra": {},
            "updated_by": "alice",
            "updated_at": "2026-05-29T00:00:00",
        }

    def test_provider(self, runtime_name: str, *, principal_id: str | None = None):
        self.tested.append(runtime_name)
        self.audit_events.append(
            {"runtime_name": runtime_name, "action": "test", "principal_id": principal_id}
        )
        if runtime_name == "missing":
            raise KeyError(runtime_name)
        return self.snapshot()["providers"][0]

    def start_provider(self, runtime_name: str, *, principal_id: str | None = None):
        self.started.append(runtime_name)
        self.audit_events.append(
            {"runtime_name": runtime_name, "action": "start", "principal_id": principal_id}
        )
        return {
            "runtime_name": runtime_name,
            "operation": "start",
            "status": "succeeded",
            "message": "已提交 Codex app-server 启动。",
            "details": {"pid": 4321},
        }

    def stop_provider(self, runtime_name: str, *, principal_id: str | None = None):
        self.stopped.append(runtime_name)
        return {
            "runtime_name": runtime_name,
            "operation": "stop",
            "status": "succeeded",
            "message": "已停止 Codex app-server。",
            "details": {"pid": 4321},
        }

    def restart_provider(self, runtime_name: str, *, principal_id: str | None = None):
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


class _FakeCodexProcessManager:
    def start(self):
        return RuntimeOperationResult(
            runtime_name="codex_app_server",
            operation="start",
            status="succeeded",
            message="已提交 Codex app-server 启动。",
            details={"profile": "local-codex-app-server"},
        )


class _RuntimeConfigRepository:
    def __init__(self) -> None:
        self.audit_events: list[RuntimeManagementAuditEvent] = []
        self.configs: dict[str, RuntimeProviderConfigSnapshot] = {}

    def get_provider_config(self, runtime_name: str):
        return self.configs.get(runtime_name)

    def upsert_provider_config(self, update):
        snapshot = RuntimeProviderConfigSnapshot(
            runtime_name=update.runtime_name,
            enabled=update.enabled,
            endpoint=update.endpoint,
            model=update.model,
            secret_ref=f"runtime_provider:{update.runtime_name}:api_key" if update.api_key else None,
            extra=update.extra,
            updated_by=update.updated_by,
            updated_at=None,
        )
        self.configs[update.runtime_name] = snapshot
        return snapshot

    def record_audit_event(
        self,
        *,
        runtime_name: str,
        action: str,
        principal_id: str | None,
        status: str,
        metadata: dict,
    ):
        audit = RuntimeManagementAuditEvent(
            id=len(self.audit_events) + 1,
            runtime_name=runtime_name,
            action=action,
            principal_id=principal_id,
            status=status,
            metadata=metadata,
            created_at=None,
        )
        self.audit_events.append(audit)
        return audit


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


def _auth_header(
    *,
    principal_id: str = "alice",
    roles: list[str] | None = None,
) -> dict[str, str]:
    token = jwt.encode(
        {
            "user_id": principal_id,
            "principal_id": principal_id,
            "user_name": principal_id,
            "roles": roles or ["user"],
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=1),
        },
        "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


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
    assert runtime_management.audit_events == [
        {
            "runtime_name": "openai_compatible",
            "action": "test",
            "principal_id": "alice",
        }
    ]


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
    assert runtime_management.audit_events == [
        {
            "runtime_name": "codex_app_server",
            "action": "start",
            "principal_id": "alice",
        }
    ]


def test_agent_runtime_api_writes_management_audit_event_to_repository():
    runtime_config_repository = _RuntimeConfigRepository()
    runtime_config_service = RuntimeConfigService(
        repository=runtime_config_repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "server_managed": True,
            "endpoint": "http://127.0.0.1:8799",
        },
    )
    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "server_managed": True,
            "endpoint": "http://127.0.0.1:8799",
        },
        runtime_config_service=runtime_config_service,
        codex_process_manager=_FakeCodexProcessManager(),
    )

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).post("/api/v1/agent-runtime/providers/codex_app_server/start")

    assert resp.status_code == 200
    audit = runtime_config_repository.audit_events[0]
    assert audit.runtime_name == "codex_app_server"
    assert audit.action == "start"
    assert audit.principal_id == "alice"
    assert audit.status == "succeeded"


def test_agent_runtime_api_returns_masked_provider_config():
    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: _RuntimeManagement(),
    ).get("/api/v1/agent-runtime/providers/openai_compatible/config")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["runtime_name"] == "openai_compatible"
    assert data["api_key"] == "********"


def test_agent_runtime_api_updates_provider_config_without_returning_secret():
    runtime_config_repository = _RuntimeConfigRepository()
    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={"enabled": False},
        runtime_config_service=RuntimeConfigService(
            repository=runtime_config_repository,
            openai_config={"api_key": "", "api_base": "", "model": ""},
            codex_config={"enabled": False},
        ),
    )

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json={
            "enabled": True,
            "endpoint": "https://api.openai.com/v1",
            "model": "gpt-5.1",
            "api_key": "sk-live-value",
        },
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["api_key"] == "********"
    assert data["updated_by"] == "alice"


def test_agent_runtime_api_rejects_non_admin_mutating_management_routes_outside_testing():
    runtime_management = _RuntimeManagement()
    client = _client(
        lambda: _Repo(),
        principal_id=None,
        testing=False,
        runtime_management_provider=lambda: runtime_management,
    )
    headers = _auth_header(roles=["user"])

    update_resp = client.put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json={"enabled": True},
        headers=headers,
    )
    start_resp = client.post(
        "/api/v1/agent-runtime/providers/codex_app_server/start",
        headers=headers,
    )
    stop_resp = client.post(
        "/api/v1/agent-runtime/providers/codex_app_server/stop",
        headers=headers,
    )
    restart_resp = client.post(
        "/api/v1/agent-runtime/providers/codex_app_server/restart",
        headers=headers,
    )

    assert update_resp.status_code == 403
    assert start_resp.status_code == 403
    assert stop_resp.status_code == 403
    assert restart_resp.status_code == 403
    assert runtime_management.started == []
    assert runtime_management.stopped == []


def test_agent_runtime_api_rejects_non_mapping_provider_extra_payload():
    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={"enabled": False},
        runtime_config_service=RuntimeConfigService(
            repository=_RuntimeConfigRepository(),
            openai_config={"api_key": "", "api_base": "", "model": ""},
            codex_config={"enabled": False},
        ),
    )

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json={"enabled": True, "extra": ["not", "a", "mapping"]},
    )

    assert resp.status_code == 400
    assert resp.get_json()["details"]["code"] == "RUNTIME_PROVIDER_CONFIG_INVALID"


def test_agent_runtime_api_rejects_non_object_provider_config_payloads():
    runtime_config_repository = _RuntimeConfigRepository()
    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={"enabled": False},
        runtime_config_service=RuntimeConfigService(
            repository=runtime_config_repository,
            openai_config={"api_key": "", "api_base": "", "model": ""},
            codex_config={"enabled": False},
        ),
    )
    client = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    )

    list_resp = client.put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json=[],
    )
    false_resp = client.put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json=False,
    )
    zero_resp = client.put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json=0,
    )

    assert list_resp.status_code == 400
    assert false_resp.status_code == 400
    assert zero_resp.status_code == 400
    assert runtime_config_repository.configs == {}


def test_agent_runtime_api_rejects_non_string_provider_config_scalars():
    runtime_config_repository = _RuntimeConfigRepository()
    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={"enabled": False},
        runtime_config_service=RuntimeConfigService(
            repository=runtime_config_repository,
            openai_config={"api_key": "", "api_base": "", "model": ""},
            codex_config={"enabled": False},
        ),
    )

    resp = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    ).put(
        "/api/v1/agent-runtime/providers/openai_compatible/config",
        json={"enabled": True, "endpoint": {"url": "https://api.openai.com/v1"}},
    )

    assert resp.status_code == 400
    assert resp.get_json()["details"] == {
        "code": "RUNTIME_PROVIDER_CONFIG_INVALID",
        "field": "endpoint",
    }
    assert runtime_config_repository.configs == {}


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


def test_agent_runtime_api_serializes_codex_transport_capabilities_when_endpoint_configured():
    class _CodexClient:
        def capabilities(self):
            return {
                "actions": ["semantic.modeling.review_proposal"],
                "artifacts": ["model_patch"],
                "events": ["run.succeeded"],
                "tools": ["read_file"],
                "max_context_tokens": 200000,
            }

    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={"enabled": True, "endpoint": "http://127.0.0.1:8765"},
        codex_client_factory=lambda config: _CodexClient(),
    )
    client = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    )

    resp = client.get("/api/v1/agent-runtime/providers/codex_app_server/capabilities")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["actions"] == ["semantic.modeling.review_proposal"]
    assert data["details"]["tools"] == ["read_file"]
    assert data["details"]["max_context_tokens"] == 200000


def test_agent_runtime_api_marks_codex_capabilities_fallback_as_degraded():
    class _CodexClient:
        def capabilities(self):
            from app.infrastructure.agent_inference_runtime.codex_http_client import (
                CodexAppServerClientError,
            )

            raise CodexAppServerClientError(
                "Codex app-server provider 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"path": "/capabilities"},
            )

    runtime_management = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={"enabled": True, "endpoint": "http://127.0.0.1:8765"},
        codex_client_factory=lambda config: _CodexClient(),
    )
    client = _client(
        lambda: _Repo(),
        runtime_management_provider=lambda: runtime_management,
    )

    resp = client.get("/api/v1/agent-runtime/providers/codex_app_server/capabilities")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["available"] is False
    assert data["details"]["source"] == "process_manager_fallback"
    assert data["details"]["transport_available"] is False
    assert data["details"]["transport_error"] == {
        "code": "RUNTIME_PROVIDER_ERROR",
        "path": "/capabilities",
        "message": "Codex app-server provider 调用失败。",
    }
