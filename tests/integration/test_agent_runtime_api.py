from __future__ import annotations

from dataclasses import dataclass

from flask import Flask

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
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

    def get_run(self, run_id: str):
        if run_id == "run_object":
            return _RunObject()
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


def _client(repo: _Repo | None = None):
    app = Flask(__name__)
    app.config.update(TESTING=True)
    app.register_blueprint(create_agent_runtime_blueprint(repo or _Repo()))
    return app.test_client()


def test_agent_runtime_api_returns_run_detail():
    resp = _client().get("/api/v1/agent-runtime/runs/run_1")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["run_id"] == "run_1"
    assert data["runtime_name"] == "openai_compatible"
    assert data["runtime_context_ref"]["turn_id"] == "turn1"
    assert data["provider_ref"]["provider_run_id"] == "provider_1"
    assert data["usage"]["total_tokens"] == 7


def test_agent_runtime_api_returns_not_found_code():
    resp = _client().get("/api/v1/agent-runtime/runs/missing")

    assert resp.status_code == 404
    body = resp.get_json()
    assert body["code"] == -1
    assert body["details"]["code"] == "RUNTIME_RUN_NOT_FOUND"


def test_agent_runtime_api_returns_artifacts_and_passes_principal_id():
    repo = _Repo()

    resp = _client(repo).get("/api/v1/agent-runtime/runs/run_1/artifacts")

    assert resp.status_code == 200
    assert repo.artifact_principal_ids == [None]
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
    resp = _client().get("/api/v1/agent-runtime/runs/run_object")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["runtime_name"] == "codex_app_server"
    assert data["runtime_context_ref"]["session_id"] == "s2"
    assert data["error"]["code"] == "CODEX_RUNTIME_UNAVAILABLE"

    artifacts_resp = _client().get("/api/v1/agent-runtime/runs/run_object/artifacts")
    assert artifacts_resp.status_code == 200
    assert artifacts_resp.get_json()["data"]["items"][0]["artifact_id"] == "artifact_obj"
