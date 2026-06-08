from __future__ import annotations

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_client import CodexSdkClientError
from app.infrastructure.agent_inference_runtime.codex_sdk_client import CodexSdkClient


class _FakeSdkFactory:
    package_name = "openai_codex_sdk"

    def __init__(self, *, final_response: str = '{"summary":"复审通过","findings":[]}') -> None:
        self.final_response = final_response
        self.started_options: list[dict] = []
        self.prompts: list[str] = []

    def create(self):
        return _FakeCodex(self)


class _FakeCodex:
    def __init__(self, factory: _FakeSdkFactory) -> None:
        self._factory = factory

    def start_thread(self, options=None):
        self._factory.started_options.append(dict(options or {}))
        return _FakeThread(self._factory)


class _FakeThread:
    id = "thread_sdk_1"

    def __init__(self, factory: _FakeSdkFactory) -> None:
        self._factory = factory

    def run(self, prompt, options=None):
        self._factory.prompts.append(str(prompt))
        return _FakeTurn(final_response=self._factory.final_response)


class _FakeTurn:
    def __init__(self, *, final_response: str) -> None:
        self.final_response = final_response
        self.items = [
            {
                "type": "agent_message",
                "text": final_response,
            }
        ]
        self.usage = {
            "input_tokens": 10,
            "cached_input_tokens": 0,
            "output_tokens": 5,
        }


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
        output_schema="semantic.modeling.review_proposal.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=300, allow_network=False),
        preferred_runtime="codex_sdk",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_codex_sdk_client_submits_background_run_and_polls_structured_output(tmp_path):
    sdk_factory = _FakeSdkFactory()
    client = CodexSdkClient(
        project_root=str(tmp_path),
        runtime_workspace_roots=[str(tmp_path)],
        model="gpt-5.4",
        sandbox="read-only",
        sdk_factory=sdk_factory,
    )

    provider_ref = client.submit_run(_request())
    result = _poll_until_terminal(client, provider_ref.provider_run_id)

    assert provider_ref.provider == "codex-sdk"
    assert result["status"] == "succeeded"
    assert result["provider"] == "codex-sdk"
    assert result["provider_thread_id"] == "thread_sdk_1"
    assert result["structured_output"] == {"summary": "复审通过", "findings": []}
    assert result["usage"] == {
        "input_tokens": 10,
        "cached_input_tokens": 0,
        "output_tokens": 5,
    }
    assert sdk_factory.started_options == [
        {
            "model": "gpt-5.4",
            "sandbox_mode": "read-only",
            "working_directory": str(tmp_path),
            "additional_directories": [str(tmp_path)],
            "skip_git_repo_check": True,
            "network_access_enabled": False,
            "web_search_enabled": False,
            "approval_policy": "never",
        }
    ]
    assert "semantic.modeling.review_proposal.output.v1" in sdk_factory.prompts[0]


def test_codex_sdk_client_healthcheck_reports_sdk_package(tmp_path):
    client = CodexSdkClient(
        project_root=str(tmp_path),
        runtime_workspace_roots=[str(tmp_path)],
        sdk_factory=_FakeSdkFactory(),
    )

    assert client.healthcheck() == {
        "status": "ready",
        "provider": "codex-sdk",
        "sdk_package": "openai_codex_sdk",
        "transport": "sdk",
        "project_root": str(tmp_path),
    }


def test_codex_sdk_client_missing_sdk_fails_clearly(tmp_path):
    def missing_sdk_factory():
        raise ModuleNotFoundError("No module named 'openai_codex_sdk'")

    client = CodexSdkClient(
        project_root=str(tmp_path),
        runtime_workspace_roots=[str(tmp_path)],
        sdk_factory=missing_sdk_factory,
    )

    try:
        client.healthcheck()
    except CodexSdkClientError as exc:
        assert exc.code == "RUNTIME_PROVIDER_NOT_CONFIGURED"
        assert "openai_codex" in str(exc)
        assert exc.details["provider"] == "codex-sdk"
    else:
        raise AssertionError("expected CodexSdkClientError")


def _poll_until_terminal(client: CodexSdkClient, provider_run_id: str) -> dict:
    for _ in range(20):
        result = client.poll_run(provider_run_id)
        if result["status"] in {"succeeded", "failed", "cancelled", "timeout"}:
            return result
    raise AssertionError("SDK run did not finish")
