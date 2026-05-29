from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import jwt
import pytest
from flask import Flask, g

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeManagementAuditEvent,
    RuntimeOperationResult,
    RuntimeProviderConfigSnapshot,
    RuntimeContextRef,
)
from app.application.agent_inference_runtime.codex_run_service import (
    CodexRunNotFoundError,
    CodexRunService,
)
from app.application.agent_inference_runtime.management import AgentRuntimeManagementService
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.agent_runtime import create_agent_runtime_blueprint


_DEFAULT_CONTEXT_REF = RuntimeContextRef(
    project_id="cubic3",
    session_id="s1",
    thread_id="t1",
    turn_id="turn1",
)


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
    storage_uri: str | None = None
    expires_at: datetime | None = None
    download_name: str | None = None
    runtime_context_ref: RuntimeContextRef | None = None


class _Repo:
    def __init__(self, *, artifact_root: Path | None = None) -> None:
        self.artifact_root = artifact_root
        self.artifact_principal_ids: list[str | None] = []
        self.download_principal_ids: list[str | None] = []
        self.get_run_ids: list[str] = []

    def get_run(self, run_id: str):
        self.get_run_ids.append(run_id)
        if run_id == "run_object":
            return _RunObject()
        if run_id == "run_corrupt_provider_ref":
            return AgentInferenceRuntimeRun(
                run_id="run_corrupt_provider_ref",
                app_id="semantic_modeling",
                action="semantic.modeling.review_proposal",
                runtime_name="codex_app_server",
                status="running",
                runtime_context_ref=RuntimeContextRef(
                    project_id="cubic3-data-platform",
                    session_id="s_corrupt",
                    thread_id="t_corrupt",
                    turn_id="turn_corrupt",
                ),
                principal_id="alice",
                provider_ref={"thread_id": "codex_thread_1"},
                usage={},
                error=None,
            )
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
                    storage_uri=(
                        "codex-workspace://projects/cubic3/sessions/s2/threads/t2/"
                        "turns/turn2/runs/run_object/artifacts/artifact_obj/result.json"
                    ),
                    download_name="workspace.json",
                    runtime_context_ref=RuntimeContextRef(
                        project_id="cubic3",
                        session_id="s2",
                        thread_id="t2",
                        turn_id="turn2",
                    ),
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
                storage_uri=(
                    f"codex-workspace://projects/cubic3/sessions/s1/threads/t1/"
                    f"turns/turn1/runs/{run_id}/artifacts/artifact_1/result.json"
                ),
                download_name="patch.json",
                runtime_context_ref=_DEFAULT_CONTEXT_REF,
            )
        ]

    def get_artifact_for_download(
        self,
        *,
        run_id: str,
        artifact_id: str,
        principal_id: str | None,
    ):
        self.download_principal_ids.append(principal_id)
        if run_id != "run_1" or artifact_id != "artifact_1" or principal_id != "alice":
            return None
        if self.artifact_root is None:
            return None
        artifact_path = (
            self.artifact_root
            / "projects"
            / "cubic3"
            / "sessions"
            / "s1"
            / "threads"
            / "t1"
            / "turns"
            / "turn1"
            / "runs"
            / run_id
            / "artifacts"
            / artifact_id
            / "result.json"
        )
        if not artifact_path.exists():
            return None
        digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
        return AgentInferenceRuntimeArtifact(
            artifact_id="artifact_1",
            run_id=run_id,
            artifact_type="model_patch",
            title="建模补丁",
            summary="候选语义模型 patch",
            mime_type="application/json",
            size_bytes=artifact_path.stat().st_size,
            sha256=f"sha256:{digest}",
            storage_uri=(
                f"codex-workspace://projects/cubic3/sessions/s1/threads/t1/"
                f"turns/turn1/runs/{run_id}/artifacts/{artifact_id}/result.json"
            ),
            download_name="patch.json",
            runtime_context_ref=_DEFAULT_CONTEXT_REF,
        )


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


class _CodexRunService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str | None]] = []

    def poll(self, run_id: str, principal_id: str | None = None):
        self.calls.append(("poll", run_id, principal_id))
        if principal_id != "alice":
            raise CodexRunNotFoundError(run_id)
        return {"run_id": run_id, "provider_run_id": "provider_1", "status": "running"}

    def cancel(self, run_id: str, principal_id: str | None = None):
        self.calls.append(("cancel", run_id, principal_id))
        if principal_id != "alice":
            raise CodexRunNotFoundError(run_id)
        return {"run_id": run_id, "provider_run_id": "provider_1", "status": "cancelled"}

    def read_events(self, run_id: str, principal_id: str | None = None):
        self.calls.append(("events", run_id, principal_id))
        if principal_id != "alice":
            raise CodexRunNotFoundError(run_id)
        return {
            "run_id": run_id,
            "provider_run_id": "provider_1",
            "items": [{"event_type": "run.started", "seq": 1}],
        }

    def collect_artifacts(self, run_id: str, principal_id: str | None = None):
        self.calls.append(("collect_artifacts", run_id, principal_id))
        if principal_id != "alice":
            raise CodexRunNotFoundError(run_id)
        return {
            "run_id": run_id,
            "provider_run_id": "provider_1",
            "items": [{"artifact_id": "artifact_provider_1"}],
        }


class _UnusedCodexClient:
    def stream_events(self, provider_run_id: str):
        raise AssertionError("stream_events should not be called without provider_run_id")

    def collect_artifacts(self, provider_run_id: str):
        raise AssertionError("collect_artifacts should not be called without provider_run_id")


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
        if update.api_key and update.api_key.strip():
            raise ValueError("runtime config secret store is not configured")
        snapshot = RuntimeProviderConfigSnapshot(
            runtime_name=update.runtime_name,
            enabled=update.enabled,
            endpoint=update.endpoint,
            model=update.model,
            secret_ref=None,
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
    roles: list[str] | None = None,
    testing: bool = True,
    runtime_management_provider=None,
    codex_run_service_provider=None,
    codex_runtime_root: str | None = None,
):
    app = Flask(__name__)
    app.config.update(TESTING=testing, JWT_SECRET="test-secret")
    if codex_runtime_root is not None:
        app.config["AGENT_CODEX_RUNTIME_ROOT"] = codex_runtime_root
    register_error_handlers(app)

    if testing and principal_id is not None:
        @app.before_request
        def _inject_principal():
            g.principal_id = principal_id
            if roles is not None:
                g.user_roles = roles

    app.register_blueprint(
        create_agent_runtime_blueprint(
            repository_provider,
            runtime_management_provider=runtime_management_provider,
            codex_run_service_provider=codex_run_service_provider,
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
            "expires_at": None,
            "downloadable": True,
            "download_url": "/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download",
        }
    ]
    assert "storage_uri" not in data["items"][0]


def test_agent_runtime_api_encodes_download_url_path_segments():
    class _SpecialIdRepo(_Repo):
        def get_run(self, run_id: str):
            if run_id == "run special":
                return AgentInferenceRuntimeRun(
                    run_id="run special",
                    app_id="semantic_modeling",
                    action="semantic.modeling.chat",
                    runtime_name="openai_compatible",
                    status="succeeded",
                    runtime_context_ref=RuntimeContextRef(
                        project_id="cubic3-data-platform",
                        session_id="s_special",
                        thread_id="t_special",
                        turn_id="turn_special",
                    ),
                    principal_id="alice",
                    provider_ref={"provider_run_id": "provider_special"},
                    usage={},
                    error=None,
                )
            return super().get_run(run_id)

        def list_artifacts(self, *, run_id: str, principal_id: str | None):
            self.artifact_principal_ids.append(principal_id)
            return [
                AgentInferenceRuntimeArtifact(
                    artifact_id="artifact with space?",
                    run_id="run special",
                    artifact_type="model_patch",
                    title="特殊 ID 产物",
                    summary="用于验证 URL path segment 编码",
                    mime_type="application/json",
                    size_bytes=2,
                    sha256="sha-1",
                    storage_uri=(
                        "codex-workspace://projects/cubic3/sessions/s_special/"
                        "threads/t_special/turns/turn_special/runs/run%20special/"
                        "artifacts/artifact%20with%20space%3F/result.json"
                    ),
                    download_name="special.json",
                    runtime_context_ref=RuntimeContextRef(
                        project_id="cubic3",
                        session_id="s_special",
                        thread_id="t_special",
                        turn_id="turn_special",
                    ),
                )
            ]

    resp = _client(lambda: _SpecialIdRepo()).get(
        "/api/v1/agent-runtime/runs/run special/artifacts"
    )

    assert resp.status_code == 200
    item = resp.get_json()["data"]["items"][0]
    assert (
        item["download_url"]
        == "/api/v1/agent-runtime/runs/run%20special/"
        "artifacts/artifact%20with%20space%3F/download"
    )


def test_agent_runtime_api_does_not_generate_download_url_for_slash_ids():
    class _SlashIdRepo(_Repo):
        def get_run(self, run_id: str):
            if run_id == "run special":
                return AgentInferenceRuntimeRun(
                    run_id="run special",
                    app_id="semantic_modeling",
                    action="semantic.modeling.chat",
                    runtime_name="openai_compatible",
                    status="succeeded",
                    runtime_context_ref=RuntimeContextRef(
                        project_id="cubic3-data-platform",
                        session_id="s_special",
                        thread_id="t_special",
                        turn_id="turn_special",
                    ),
                    principal_id="alice",
                    provider_ref={"provider_run_id": "provider_special"},
                    usage={},
                    error=None,
                )
            return super().get_run(run_id)

        def list_artifacts(self, *, run_id: str, principal_id: str | None):
            self.artifact_principal_ids.append(principal_id)
            return [
                AgentInferenceRuntimeArtifact(
                    artifact_id="artifact/with space?",
                    run_id="run/with space?",
                    artifact_type="model_patch",
                    title="特殊 ID 产物",
                    summary="用于验证 slash ID 不生成下载 URL",
                    mime_type="application/json",
                    size_bytes=2,
                    sha256="sha-1",
                    storage_uri=(
                        "codex-workspace://projects/cubic3/sessions/s_special/"
                        "threads/t_special/turns/turn_special/runs/run%2Fwith%20space%3F/"
                        "artifacts/artifact%2Fwith%20space%3F/result.json"
                    ),
                    download_name="special.json",
                    runtime_context_ref=RuntimeContextRef(
                        project_id="cubic3",
                        session_id="s_special",
                        thread_id="t_special",
                        turn_id="turn_special",
                    ),
                )
            ]

    resp = _client(lambda: _SlashIdRepo()).get(
        "/api/v1/agent-runtime/runs/run special/artifacts"
    )

    assert resp.status_code == 200
    item = resp.get_json()["data"]["items"][0]
    assert item["downloadable"] is False
    assert item["download_url"] is None


@pytest.mark.parametrize(
    "storage_uri",
    [
        "file:///tmp/runtime/result.json",
        "/tmp/runtime/result.json",
        "codex-workspace://projects/cubic3/result.json",
    ],
)
def test_agent_runtime_api_does_not_generate_download_url_for_non_namespace_storage_uri(
    storage_uri: str,
):
    class _UnsafeStorageRepo(_Repo):
        def list_artifacts(self, *, run_id: str, principal_id: str | None):
            self.artifact_principal_ids.append(principal_id)
            return [
                AgentInferenceRuntimeArtifact(
                    artifact_id="artifact_1",
                    run_id=run_id,
                    artifact_type="model_patch",
                    title="不可下载产物",
                    summary="用于验证列表接口不暴露非 artifact namespace 下载链接",
                    mime_type="application/json",
                    size_bytes=2,
                    sha256="sha-1",
                    storage_uri=storage_uri,
                    download_name="unsafe.json",
                    runtime_context_ref=_DEFAULT_CONTEXT_REF,
                )
            ]

    resp = _client(lambda: _UnsafeStorageRepo()).get(
        "/api/v1/agent-runtime/runs/run_1/artifacts"
    )

    assert resp.status_code == 200
    item = resp.get_json()["data"]["items"][0]
    assert item["downloadable"] is False
    assert item["download_url"] is None


def test_agent_runtime_api_does_not_generate_download_url_for_context_mismatch():
    class _ContextMismatchRepo(_Repo):
        def list_artifacts(self, *, run_id: str, principal_id: str | None):
            self.artifact_principal_ids.append(principal_id)
            return [
                AgentInferenceRuntimeArtifact(
                    artifact_id="artifact_1",
                    run_id=run_id,
                    artifact_type="model_patch",
                    title="上下文错位产物",
                    summary="用于验证列表接口不暴露跨上下文 artifact 下载链接",
                    mime_type="application/json",
                    size_bytes=2,
                    sha256="sha-1",
                    storage_uri=(
                        "codex-workspace://projects/other_project/sessions/s1/threads/t1/"
                        f"turns/turn1/runs/{run_id}/artifacts/artifact_1/result.json"
                    ),
                    download_name="mismatch.json",
                    runtime_context_ref=_DEFAULT_CONTEXT_REF,
                )
            ]

    resp = _client(lambda: _ContextMismatchRepo()).get(
        "/api/v1/agent-runtime/runs/run_1/artifacts"
    )

    assert resp.status_code == 200
    item = resp.get_json()["data"]["items"][0]
    assert item["downloadable"] is False
    assert item["download_url"] is None


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
    item = artifacts_resp.get_json()["data"]["items"][0]
    assert item["artifact_id"] == "artifact_obj"
    assert "storage_uri" not in item


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


def test_agent_runtime_api_downloads_artifact_after_owner_and_hash_checks(tmp_path: Path):
    artifact_path = (
        tmp_path
        / "projects"
        / "cubic3"
        / "sessions"
        / "s1"
        / "threads"
        / "t1"
        / "turns"
        / "turn1"
        / "runs"
        / "run_1"
        / "artifacts"
        / "artifact_1"
        / "result.json"
    )
    artifact_path.parent.mkdir(parents=True)
    artifact_path.write_bytes(b'{"patch": true}\n')
    repo = _Repo(artifact_root=tmp_path)

    resp = _client(
        lambda: repo,
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 200
    assert resp.data == b'{"patch": true}\n'
    assert "patch.json" in resp.headers["Content-Disposition"]
    assert repo.download_principal_ids == ["alice"]


@pytest.mark.parametrize(
    ("storage_uri", "artifact_path"),
    [
        ("codex-workspace://projects/cubic3/result.json", ("projects", "cubic3", "result.json")),
        ("file://{path}", ("projects", "cubic3", "result.json")),
        ("{path}", ("projects", "cubic3", "result.json")),
    ],
)
def test_agent_runtime_api_download_rejects_non_artifact_namespace_storage_uri(
    tmp_path: Path,
    storage_uri: str,
    artifact_path: tuple[str, ...],
):
    path = tmp_path.joinpath(*artifact_path)
    path.parent.mkdir(parents=True)
    path.write_bytes(b'{"patch": true}\n')
    resolved_storage_uri = storage_uri.format(path=path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()

    class _UnsafeStorageRepo(_Repo):
        def get_artifact_for_download(self, *, run_id, artifact_id, principal_id):
            self.download_principal_ids.append(principal_id)
            return AgentInferenceRuntimeArtifact(
                artifact_id=artifact_id,
                run_id=run_id,
                artifact_type="model_patch",
                title="建模补丁",
                summary="候选语义模型 patch",
                mime_type="application/json",
                size_bytes=path.stat().st_size,
                sha256=f"sha256:{digest}",
                storage_uri=resolved_storage_uri,
                download_name="patch.json",
                runtime_context_ref=_DEFAULT_CONTEXT_REF,
            )

    resp = _client(
        lambda: _UnsafeStorageRepo(artifact_root=tmp_path),
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 409
    assert resp.get_json()["details"]["code"] == "RUNTIME_ARTIFACT_INTEGRITY_ERROR"


def test_agent_runtime_api_download_uses_safe_fallback_for_control_char_name(
    tmp_path: Path,
):
    artifact_path = (
        tmp_path
        / "projects"
        / "cubic3"
        / "sessions"
        / "s1"
        / "threads"
        / "t1"
        / "turns"
        / "turn1"
        / "runs"
        / "run_1"
        / "artifacts"
        / "artifact_1"
        / "result.json"
    )
    artifact_path.parent.mkdir(parents=True)
    artifact_path.write_bytes(b'{"patch": true}\n')
    digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()

    class _ControlNameRepo(_Repo):
        def get_artifact_for_download(self, *, run_id, artifact_id, principal_id):
            self.download_principal_ids.append(principal_id)
            return AgentInferenceRuntimeArtifact(
                artifact_id=artifact_id,
                run_id=run_id,
                artifact_type="model_patch",
                title="建模补丁",
                summary="候选语义模型 patch",
                mime_type="application/json",
                size_bytes=artifact_path.stat().st_size,
                sha256=f"sha256:{digest}",
                storage_uri=(
                    f"codex-workspace://projects/cubic3/sessions/s1/threads/t1/"
                    f"turns/turn1/runs/{run_id}/artifacts/{artifact_id}/result.json"
                ),
                download_name="bad\r\nname.json",
                runtime_context_ref=_DEFAULT_CONTEXT_REF,
            )

    resp = _client(
        lambda: _ControlNameRepo(artifact_root=tmp_path),
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 200
    content_disposition = resp.headers["Content-Disposition"]
    assert "bad" not in content_disposition
    assert "filename=artifact" in content_disposition


def test_agent_runtime_api_download_hides_cross_user_artifacts(tmp_path: Path):
    repo = _Repo(artifact_root=tmp_path)

    resp = _client(
        lambda: repo,
        principal_id="mallory",
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 404
    assert resp.get_json()["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"
    assert repo.download_principal_ids == ["mallory"]


def test_agent_runtime_api_download_returns_404_for_expired_artifact(tmp_path: Path):
    class _ExpiredRepo(_Repo):
        def get_artifact_for_download(self, *, run_id, artifact_id, principal_id):
            self.download_principal_ids.append(principal_id)
            return None

    repo = _ExpiredRepo(artifact_root=tmp_path)

    resp = _client(
        lambda: repo,
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 404
    assert resp.get_json()["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"


def test_agent_runtime_api_download_rejects_hash_mismatch(tmp_path: Path):
    artifact_path = (
        tmp_path
        / "projects"
        / "cubic3"
        / "sessions"
        / "s1"
        / "threads"
        / "t1"
        / "turns"
        / "turn1"
        / "runs"
        / "run_1"
        / "artifacts"
        / "artifact_1"
        / "result.json"
    )
    artifact_path.parent.mkdir(parents=True)
    artifact_path.write_bytes(b"tampered")

    class _MismatchRepo(_Repo):
        def get_artifact_for_download(self, *, run_id, artifact_id, principal_id):
            self.download_principal_ids.append(principal_id)
            return AgentInferenceRuntimeArtifact(
                artifact_id="artifact_1",
                run_id=run_id,
                artifact_type="model_patch",
                title="建模补丁",
                summary="候选语义模型 patch",
                mime_type="application/json",
                size_bytes=8,
                sha256="sha256:" + ("0" * 64),
                storage_uri=(
                    f"codex-workspace://projects/cubic3/sessions/s1/threads/t1/"
                    f"turns/turn1/runs/{run_id}/artifacts/{artifact_id}/result.json"
                ),
                download_name="patch.json",
                runtime_context_ref=_DEFAULT_CONTEXT_REF,
            )

    resp = _client(
        lambda: _MismatchRepo(artifact_root=tmp_path),
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 409
    assert resp.get_json()["details"]["code"] == "RUNTIME_ARTIFACT_INTEGRITY_ERROR"


def test_agent_runtime_api_download_rejects_context_mismatch(tmp_path: Path):
    artifact_path = (
        tmp_path
        / "projects"
        / "other_project"
        / "sessions"
        / "s1"
        / "threads"
        / "t1"
        / "turns"
        / "turn1"
        / "runs"
        / "run_1"
        / "artifacts"
        / "artifact_1"
        / "result.json"
    )
    artifact_path.parent.mkdir(parents=True)
    artifact_path.write_bytes(b'{"patch": true}\n')
    digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()

    class _ContextMismatchRepo(_Repo):
        def get_artifact_for_download(self, *, run_id, artifact_id, principal_id):
            self.download_principal_ids.append(principal_id)
            return AgentInferenceRuntimeArtifact(
                artifact_id=artifact_id,
                run_id=run_id,
                artifact_type="model_patch",
                title="建模补丁",
                summary="候选语义模型 patch",
                mime_type="application/json",
                size_bytes=artifact_path.stat().st_size,
                sha256=f"sha256:{digest}",
                storage_uri=(
                    "codex-workspace://projects/other_project/sessions/s1/threads/t1/"
                    f"turns/turn1/runs/{run_id}/artifacts/{artifact_id}/result.json"
                ),
                download_name="patch.json",
                runtime_context_ref=_DEFAULT_CONTEXT_REF,
            )

    resp = _client(
        lambda: _ContextMismatchRepo(artifact_root=tmp_path),
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 409
    assert resp.get_json()["details"]["code"] == "RUNTIME_ARTIFACT_INTEGRITY_ERROR"


def test_agent_runtime_api_download_rejects_symlink_crossing_artifact_namespace(
    tmp_path: Path,
):
    target_path = (
        tmp_path
        / "projects"
        / "cubic3"
        / "sessions"
        / "s2"
        / "threads"
        / "t2"
        / "turns"
        / "turn2"
        / "runs"
        / "run_2"
        / "artifacts"
        / "artifact_2"
        / "result.json"
    )
    target_path.parent.mkdir(parents=True)
    target_path.write_bytes(b'{"patch": "other"}\n')
    link_path = (
        tmp_path
        / "projects"
        / "cubic3"
        / "sessions"
        / "s1"
        / "threads"
        / "t1"
        / "turns"
        / "turn1"
        / "runs"
        / "run_1"
        / "artifacts"
        / "artifact_1"
    )
    link_path.parent.mkdir(parents=True)
    link_path.symlink_to(target_path.parent, target_is_directory=True)
    digest = hashlib.sha256(target_path.read_bytes()).hexdigest()

    class _SymlinkRepo(_Repo):
        def get_artifact_for_download(self, *, run_id, artifact_id, principal_id):
            self.download_principal_ids.append(principal_id)
            return AgentInferenceRuntimeArtifact(
                artifact_id="artifact_1",
                run_id="run_1",
                artifact_type="model_patch",
                title="建模补丁",
                summary="候选语义模型 patch",
                mime_type="application/json",
                size_bytes=target_path.stat().st_size,
                sha256=f"sha256:{digest}",
                storage_uri=(
                    "codex-workspace://projects/cubic3/sessions/s1/threads/t1/"
                    "turns/turn1/runs/run_1/artifacts/artifact_1/result.json"
                ),
                download_name="patch.json",
                runtime_context_ref=_DEFAULT_CONTEXT_REF,
            )

    resp = _client(
        lambda: _SymlinkRepo(artifact_root=tmp_path),
        codex_runtime_root=str(tmp_path),
    ).get("/api/v1/agent-runtime/runs/run_1/artifacts/artifact_1/download")

    assert resp.status_code == 409
    assert resp.get_json()["details"]["code"] == "RUNTIME_ARTIFACT_INTEGRITY_ERROR"


def test_agent_runtime_api_exposes_codex_run_lifecycle_routes():
    codex_runs = _CodexRunService()
    client = _client(lambda: _Repo(), codex_run_service_provider=lambda: codex_runs)

    poll_resp = client.post("/api/v1/agent-runtime/runs/run_1/poll")
    cancel_resp = client.post("/api/v1/agent-runtime/runs/run_1/cancel")
    events_resp = client.get("/api/v1/agent-runtime/runs/run_1/events")
    artifacts_resp = client.post("/api/v1/agent-runtime/runs/run_1/collect-artifacts")

    assert poll_resp.status_code == 200
    assert poll_resp.get_json()["data"]["status"] == "running"
    assert cancel_resp.status_code == 200
    assert cancel_resp.get_json()["data"]["status"] == "cancelled"
    assert events_resp.status_code == 200
    assert events_resp.get_json()["data"]["items"][0]["event_type"] == "run.started"
    assert artifacts_resp.status_code == 200
    assert artifacts_resp.get_json()["data"]["items"][0]["artifact_id"] == "artifact_provider_1"
    assert codex_runs.calls == [
        ("poll", "run_1", "alice"),
        ("cancel", "run_1", "alice"),
        ("events", "run_1", "alice"),
        ("collect_artifacts", "run_1", "alice"),
    ]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/agent-runtime/runs/run_1/poll"),
        ("post", "/api/v1/agent-runtime/runs/run_1/cancel"),
        ("get", "/api/v1/agent-runtime/runs/run_1/events"),
        ("post", "/api/v1/agent-runtime/runs/run_1/collect-artifacts"),
    ],
)
def test_agent_runtime_api_hides_cross_user_lifecycle_routes(method: str, path: str):
    codex_runs = _CodexRunService()
    client = _client(
        lambda: _Repo(),
        principal_id="mallory",
        codex_run_service_provider=lambda: codex_runs,
    )

    resp = getattr(client, method)(path)

    assert resp.status_code == 404
    assert resp.get_json()["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/agent-runtime/runs/run_corrupt_provider_ref/events"),
        ("post", "/api/v1/agent-runtime/runs/run_corrupt_provider_ref/collect-artifacts"),
    ],
)
def test_agent_runtime_api_maps_corrupt_provider_ref_to_runtime_error(method: str, path: str):
    service = CodexRunService(client=_UnusedCodexClient(), repository=_Repo())
    client = _client(lambda: _Repo(), codex_run_service_provider=lambda: service)

    resp = getattr(client, method)(path)

    assert resp.status_code == 502
    assert resp.get_json()["details"]["code"] == "RUNTIME_PROVIDER_RESPONSE_INVALID"


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
    assert data["can_manage"] is False


def test_agent_runtime_api_status_exposes_current_principal_management_permission():
    runtime_management = _RuntimeManagement()

    resp = _client(
        lambda: _Repo(),
        principal_id="test_admin",
        roles=["platform_admin"],
        runtime_management_provider=lambda: runtime_management,
    ).get("/api/v1/agent-runtime/providers/status")

    assert resp.status_code == 200
    assert resp.get_json()["data"]["can_manage"] is True


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
        },
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["api_key"] is None
    assert data["updated_by"] == "alice"


def test_agent_runtime_api_rejects_provider_api_key_until_secret_store_exists():
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

    assert resp.status_code == 400
    assert resp.get_json()["details"] == {
        "code": "RUNTIME_PROVIDER_CONFIG_INVALID",
        "field": "api_key",
    }
    assert runtime_config_repository.configs == {}


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
    logs_resp = client.get(
        "/api/v1/agent-runtime/providers/codex_app_server/logs",
        headers=headers,
    )

    assert update_resp.status_code == 403
    assert start_resp.status_code == 403
    assert stop_resp.status_code == 403
    assert restart_resp.status_code == 403
    assert logs_resp.status_code == 403
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
