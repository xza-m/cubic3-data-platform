from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

from flask import Flask

from app.di.container import init_container
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_adapter import (
    CodexAppServerRuntimeAdapter,
)
from app.infrastructure.agent_inference_runtime.codex_client import (
    ProviderRunRef,
    ProviderThreadRef,
)
from app.infrastructure.agent_inference_runtime.codex_workspace import CodexWorkspaceStore


class _Client:
    def __init__(self, *, status_payload: dict | None = None):
        self.calls: list[str] = []
        self.submitted: list[AgentInferenceRuntimeRequest] = []
        self.status_payload = status_payload or {
            "status": "succeeded",
            "structured_output": {"message": "复审通过", "findings": []},
            "usage": {"total_tokens": 11},
        }

    def healthcheck(self):
        self.calls.append("healthcheck")
        return {"status": "ok", "version": "local-test"}

    def capabilities(self):
        self.calls.append("capabilities")
        return {"supports_artifacts": True}

    def ensure_thread(self, ref):
        self.calls.append("ensure_thread")
        return ProviderThreadRef(provider_thread_id=f"codex_thread_{ref.thread_id}")

    def submit_run(self, request):
        self.calls.append("submit_run")
        self.submitted.append(request)
        return ProviderRunRef(provider_run_id="codex_run_1")

    def poll_run(self, provider_run_id):
        self.calls.append(f"poll_run:{provider_run_id}")
        return self.status_payload

    def stream_events(self, provider_run_id, *, cursor=None):
        self.calls.append(f"stream_events:{provider_run_id}:{cursor}")
        return {
            "events": [
                {"event_type": "run.started", "seq": 1},
                {"event_type": "run.succeeded", "seq": 2},
            ],
            "next_cursor": "2",
            "has_more": False,
        }

    def cancel_run(self, provider_run_id):
        self.calls.append(f"cancel_run:{provider_run_id}")
        return {"status": "cancelled"}

    def collect_artifacts(self, provider_run_id):
        self.calls.append(f"collect_artifacts:{provider_run_id}")
        return [
            {
                "artifact_id": "artifact_1",
                "run_id": "provider_run_should_be_rewritten",
                "artifact_type": "json",
                "title": "复审结果",
                "summary": "复审结构化结果",
                "mime_type": "application/json",
                "size_bytes": 128,
                "sha256": "sha256:abc",
            }
        ]


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef("cubic3-data-platform", "s1", "t1", "turn1"),
        principal_id="alice",
        input={"proposal_id": "proposal_1"},
        context_pack={"diff": []},
        output_schema="semantic.modeling.review.output.v1",
        runtime_policy=RuntimePolicy(
            max_runtime_seconds=300,
            allow_network=False,
            command_policy={"network": "disabled"},
        ),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_codex_adapter_submits_run_and_returns_structured_output(tmp_path: Path):
    client = _Client()
    adapter = CodexAppServerRuntimeAdapter(
        client=client,
        workspace_store=CodexWorkspaceStore(runtime_root=tmp_path),
    )

    result = adapter.invoke(_request())

    assert result.status == "succeeded"
    assert result.runtime_name == "codex_app_server"
    assert result.action == "semantic.modeling.review_proposal"
    assert result.structured_output == {"message": "复审通过", "findings": []}
    assert result.usage == {"total_tokens": 11}
    assert [event["event_type"] for event in result.trace] == [
        "run.started",
        "run.succeeded",
    ]
    assert result.error is None
    assert result.artifacts == [
        AgentInferenceRuntimeArtifact(
            artifact_id="artifact_1",
            run_id=result.run_id,
            artifact_type="json",
            title="复审结果",
            summary="复审结构化结果",
            mime_type="application/json",
            size_bytes=128,
            sha256="sha256:abc",
        )
    ]
    assert client.submitted[0].runtime_context_ref.turn_id == "turn1"
    assert client.calls == [
        "healthcheck",
        "capabilities",
        "ensure_thread",
        "submit_run",
        "poll_run:codex_run_1",
        "stream_events:codex_run_1:None",
        "collect_artifacts:codex_run_1",
    ]

    turn_dir = (
        tmp_path.resolve()
        / "projects"
        / "cubic3-data-platform"
        / "sessions"
        / "s1"
        / "threads"
        / "t1"
        / "turns"
        / "turn1"
    )
    request_payload = json.loads((turn_dir / "request.json").read_text(encoding="utf-8"))
    policy_payload = json.loads((turn_dir / "runtime_policy.json").read_text(encoding="utf-8"))
    assert request_payload["action"] == "semantic.modeling.review_proposal"
    assert request_payload["principal_id"] == "alice"
    assert request_payload["input"] == {"proposal_id": "proposal_1"}
    assert request_payload["context_pack"] == {"diff": []}
    assert request_payload["runtime_context_ref"]["turn_id"] == "turn1"
    assert policy_payload["max_runtime_seconds"] == 300
    assert policy_payload["allow_network"] is False
    assert policy_payload["command_policy"] == {"network": "disabled"}


def test_codex_adapter_can_handle_async_codex_requests_only(tmp_path: Path):
    adapter = CodexAppServerRuntimeAdapter(
        client=_Client(),
        workspace_store=CodexWorkspaceStore(runtime_root=tmp_path),
    )
    request = _request()

    assert adapter.can_handle(request) is True
    assert adapter.can_handle(replace(request, preferred_runtime=None)) is True
    assert adapter.can_handle(replace(request, preferred_runtime="openai_compatible")) is False
    assert adapter.can_handle(replace(request, execution_mode="sync")) is False


def test_codex_adapter_maps_failed_provider_status_to_result_error(tmp_path: Path):
    client = _Client(
        status_payload={
            "status": "error",
            "structured_output": {"partial": True},
            "usage": {"total_tokens": 3},
            "error": {"code": "PROVIDER_ERROR", "message": "provider failed"},
        }
    )
    adapter = CodexAppServerRuntimeAdapter(
        client=client,
        workspace_store=CodexWorkspaceStore(runtime_root=tmp_path),
    )

    result = adapter.invoke(_request())

    assert result.status == "failed"
    assert result.structured_output == {"partial": True}
    assert result.usage == {"total_tokens": 3}
    assert result.error == {"code": "PROVIDER_ERROR", "message": "provider failed"}


def test_container_reads_agent_codex_config_without_router_enablement(monkeypatch):
    monkeypatch.setenv("AGENT_CODEX_ENABLED", "true")
    monkeypatch.setenv("AGENT_CODEX_PROJECT_ID", "project_x")
    monkeypatch.setenv("AGENT_CODEX_PROJECT_ROOT", "/repo/project_x")
    monkeypatch.setenv("AGENT_CODEX_RUNTIME_ROOT", "/tmp/codex-runtime")
    monkeypatch.setenv("AGENT_CODEX_TRANSPORT", "unix_socket")
    monkeypatch.setenv("AGENT_CODEX_ENDPOINT", "http://127.0.0.1:8799")
    monkeypatch.setenv("AGENT_CODEX_UNIX_SOCKET", "/tmp/codex.sock")
    monkeypatch.setenv("AGENT_CODEX_MAX_CONCURRENCY", "5")

    app = Flask(__name__)
    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        REDIS_URL="redis://localhost:6379/0",
    )

    container = init_container(app)

    assert container.config.agent_codex.enabled() is True
    assert container.config.agent_codex.project_id() == "project_x"
    assert container.config.agent_codex.project_root() == "/repo/project_x"
    assert container.config.agent_codex.runtime_root() == "/tmp/codex-runtime"
    assert container.config.agent_codex.transport() == "unix_socket"
    assert container.config.agent_codex.endpoint() == "http://127.0.0.1:8799"
    assert container.config.agent_codex.unix_socket() == "/tmp/codex.sock"
    assert container.config.agent_codex.max_concurrency() == 5
    router = container.agent_inference_runtime_router()
    assert [adapter.runtime_name for adapter in router._adapters] == ["openai_compatible"]
