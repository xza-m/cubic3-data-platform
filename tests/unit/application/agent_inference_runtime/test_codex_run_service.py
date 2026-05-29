from __future__ import annotations

import pytest

from app.application.agent_inference_runtime.codex_run_service import (
    CodexRunNotFoundError,
    CodexRunService,
)
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_http_client import CodexAppServerClientError


class _Client:
    def __init__(self) -> None:
        self.submitted: list[dict] = []
        self.poll_payload: object = {
            "provider_run_id": "codex_run_1",
            "status": "succeeded",
            "usage": {"total_tokens": 11},
            "result": {"summary": "reviewed"},
        }
        self.cancel_payload: object = {"provider_run_id": "codex_run_1", "status": "cancelled"}
        self.events_payload: object = [{"event_type": "run.started", "seq": 1}]
        self.artifacts_payload: object = [
            {
                "artifact_id": "artifact_1",
                "artifact_type": "model_patch",
                "title": "建模补丁",
            }
        ]
        self.polled: list[str] = []
        self.cancelled: list[str] = []
        self.event_run_ids: list[str] = []
        self.artifact_run_ids: list[str] = []

    def submit_run(self, payload: dict) -> dict:
        self.submitted.append(payload)
        return {"provider_run_id": "codex_run_1", "status": "queued"}

    def poll_run(self, provider_run_id: str) -> object:
        self.polled.append(provider_run_id)
        return self.poll_payload

    def cancel_run(self, provider_run_id: str) -> object:
        self.cancelled.append(provider_run_id)
        return self.cancel_payload

    def events(self, provider_run_id: str) -> object:
        self.event_run_ids.append(provider_run_id)
        return self.events_payload

    def artifacts(self, provider_run_id: str) -> object:
        self.artifact_run_ids.append(provider_run_id)
        return self.artifacts_payload


class _Repo:
    def __init__(self) -> None:
        self.runs: dict[str, AgentInferenceRuntimeRun] = {}
        self.saved: list[AgentInferenceRuntimeRun] = []

    def save_run(self, run: AgentInferenceRuntimeRun) -> None:
        self.runs[run.run_id] = run
        self.saved.append(run)

    def get_run(self, run_id: str) -> AgentInferenceRuntimeRun | None:
        return self.runs.get(run_id)


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="session_1",
            thread_id="thread_1",
            turn_id="turn_1",
        ),
        principal_id="alice",
        input={"proposal_id": "proposal_1"},
        context_pack={"diff": []},
        output_schema="semantic.review.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=300, allow_network=False),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def _service(client: _Client | None = None, repo: _Repo | None = None) -> tuple[CodexRunService, _Client, _Repo]:
    client = client or _Client()
    repo = repo or _Repo()
    service = CodexRunService(
        client=client,
        repository=repo,
        run_id_factory=lambda: "run_local_1",
    )
    return service, client, repo


def test_submit_creates_local_run_and_sends_request_payload():
    service, client, repo = _service()

    result = service.submit(_request())

    assert result == {
        "run_id": "run_local_1",
        "provider_run_id": "codex_run_1",
        "status": "queued",
    }
    assert client.submitted[0]["action"] == "semantic.modeling.review_proposal"
    assert client.submitted[0]["principal_id"] == "alice"
    assert client.submitted[0]["runtime_context_ref"]["turn_id"] == "turn_1"
    assert client.submitted[0]["input"] == {"proposal_id": "proposal_1"}
    assert client.submitted[0]["context_pack"] == {"diff": []}
    saved = repo.runs["run_local_1"]
    assert saved.runtime_name == "codex_app_server"
    assert saved.status == "queued"
    assert saved.principal_id == "alice"
    assert saved.provider_ref == {"provider_run_id": "codex_run_1"}


def test_poll_fetches_provider_status_and_updates_run_usage_error_and_provider_ref():
    service, client, repo = _service()
    service.submit(_request())

    result = service.poll("run_local_1", principal_id="alice")

    assert client.polled == ["codex_run_1"]
    assert result["status"] == "succeeded"
    assert result["provider_run_id"] == "codex_run_1"
    assert result["usage"] == {"total_tokens": 11}
    assert result["provider_ref"]["result"] == {"summary": "reviewed"}
    saved = repo.runs["run_local_1"]
    assert saved.status == "succeeded"
    assert saved.usage == {"total_tokens": 11}
    assert saved.error is None
    assert saved.provider_ref == {
        "provider_run_id": "codex_run_1",
        "status": "succeeded",
        "result": {"summary": "reviewed"},
    }


def test_cancel_calls_provider_and_marks_local_run_cancelled():
    service, client, repo = _service()
    service.submit(_request())

    result = service.cancel("run_local_1", principal_id="alice")

    assert client.cancelled == ["codex_run_1"]
    assert result["status"] == "cancelled"
    assert repo.runs["run_local_1"].status == "cancelled"


@pytest.mark.parametrize("method_name", ["poll", "cancel", "read_events", "collect_artifacts"])
def test_wrong_principal_gets_permission_safe_not_found(method_name: str):
    service, client, _repo = _service()
    service.submit(_request())

    with pytest.raises(CodexRunNotFoundError):
        getattr(service, method_name)("run_local_1", principal_id="mallory")

    assert client.polled == []
    assert client.cancelled == []
    assert client.event_run_ids == []
    assert client.artifact_run_ids == []


def test_events_and_artifacts_are_read_from_owned_provider_run():
    service, client, _repo = _service()
    service.submit(_request())

    events = service.read_events("run_local_1", principal_id="alice")
    artifacts = service.collect_artifacts("run_local_1", principal_id="alice")

    assert client.event_run_ids == ["codex_run_1"]
    assert client.artifact_run_ids == ["codex_run_1"]
    assert events == {"run_id": "run_local_1", "provider_run_id": "codex_run_1", "items": client.events_payload}
    assert artifacts == {
        "run_id": "run_local_1",
        "provider_run_id": "codex_run_1",
        "items": client.artifacts_payload,
    }


def test_invalid_provider_payload_records_poll_error_without_marking_succeeded():
    service, client, repo = _service()
    service.submit(_request())
    client.poll_payload = {"provider_run_id": "codex_run_1", "status": "succeeded", "usage": ["bad"]}

    result = service.poll("run_local_1", principal_id="alice")

    assert result["status"] == "queued"
    assert result["error"] is None
    assert result["provider_ref"]["last_poll_error"]["code"] == "RUNTIME_PROVIDER_RESPONSE_INVALID"
    saved = repo.runs["run_local_1"]
    assert saved.status == "queued"
    assert saved.usage == {}


def test_poll_transient_provider_error_does_not_overwrite_terminal_success():
    service, client, repo = _service()
    service.submit(_request())
    client.poll_payload = {
        "provider_run_id": "codex_run_1",
        "status": "succeeded",
        "usage": {"total_tokens": 11},
    }
    service.poll("run_local_1", principal_id="alice")

    def _raise_provider_error(provider_run_id: str):
        raise CodexAppServerClientError(
            "Codex app-server provider 调用失败。",
            code="RUNTIME_PROVIDER_ERROR",
            details={"path": f"/runs/{provider_run_id}"},
        )

    client.poll_run = _raise_provider_error
    result = service.poll("run_local_1", principal_id="alice")

    assert result["status"] == "succeeded"
    assert result["error"] is None
    saved = repo.runs["run_local_1"]
    assert saved.status == "succeeded"
    assert saved.error is None
    assert saved.provider_ref["last_poll_error"]["code"] == "RUNTIME_PROVIDER_ERROR"
