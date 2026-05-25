from __future__ import annotations

from dataclasses import replace
from datetime import datetime

import pytest

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.openai_compatible_adapter import (
    OpenAICompatibleRuntimeAdapter,
)


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.chat",
        runtime_context_ref=RuntimeContextRef("cubic3-data-platform", "s1", "t1", "turn1"),
        principal_id="alice",
        input={"message": "查询学生评论数"},
        context_pack={"evidence": []},
        output_schema="semantic.modeling.chat.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime="openai_compatible",
        execution_mode="sync",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def _patch_openai_response(
    monkeypatch,
    content: str,
    *,
    error: Exception | None = None,
    init_error: Exception | None = None,
):
    clients = []

    class _Completion:
        choices = [
            type("Choice", (), {"message": type("Msg", (), {"content": content})()})
        ]
        usage = type("Usage", (), {"model_dump": lambda self: {"total_tokens": 7}})()

    class _Client:
        def __init__(self, **kwargs):
            if init_error is not None:
                raise init_error
            self.kwargs = kwargs
            self.create_kwargs = None
            clients.append(self)
            self.chat = type(
                "Chat",
                (),
                {
                    "completions": type(
                        "Completions",
                        (),
                        {"create": self._create},
                    )()
                },
            )()

        def _create(self, *_args, **kwargs):
            self.create_kwargs = kwargs
            if error is not None:
                raise error
            return _Completion()

    monkeypatch.setattr(
        "app.infrastructure.agent_inference_runtime.openai_compatible_adapter.OpenAI",
        _Client,
    )
    return clients


def test_openai_adapter_uses_agent_openai_config_not_legacy_llm_env(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "legacy-key")
    monkeypatch.delenv("AGENT_OPENAI_API_KEY", raising=False)

    adapter = OpenAICompatibleRuntimeAdapter()

    assert adapter.runtime_name == "openai_compatible"
    assert adapter.is_configured is False
    with pytest.raises(AgentInferenceRuntimeError) as exc:
        adapter.invoke(_request())
    assert exc.value.code == "RUNTIME_NOT_CONFIGURED"


def test_openai_adapter_parses_json_response(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    monkeypatch.setenv("AGENT_OPENAI_MODEL", "stub-model")
    _patch_openai_response(monkeypatch, '{"message":"ok"}')

    result = OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert result.status == "succeeded"
    assert result.runtime_name == "openai_compatible"
    assert result.structured_output == {"message": "ok"}
    assert result.usage == {"total_tokens": 7}


def test_openai_adapter_rejects_non_json_response(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    _patch_openai_response(monkeypatch, "not-json")

    with pytest.raises(AgentInferenceRuntimeError) as exc:
        OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert exc.value.code == "RUNTIME_INVALID_OUTPUT"


def test_openai_adapter_rejects_json_array_response(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    _patch_openai_response(monkeypatch, "[]")

    with pytest.raises(AgentInferenceRuntimeError) as exc:
        OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert exc.value.code == "RUNTIME_INVALID_OUTPUT"


def test_openai_adapter_wraps_provider_errors(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    _patch_openai_response(monkeypatch, '{"message":"ok"}', error=RuntimeError("provider down"))

    with pytest.raises(AgentInferenceRuntimeError) as exc:
        OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert exc.value.code == "RUNTIME_PROVIDER_ERROR"
    assert exc.value.details["runtime_name"] == "openai_compatible"


def test_openai_adapter_wraps_client_init_errors(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    _patch_openai_response(monkeypatch, '{"message":"ok"}', init_error=RuntimeError("bad client"))

    with pytest.raises(AgentInferenceRuntimeError) as exc:
        OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert exc.value.code == "RUNTIME_PROVIDER_ERROR"
    assert exc.value.details["runtime_name"] == "openai_compatible"


def test_openai_adapter_wraps_timeout_errors(monkeypatch):
    class _TimeoutError(Exception):
        pass

    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    monkeypatch.setattr(
        "app.infrastructure.agent_inference_runtime.openai_compatible_adapter.APITimeoutError",
        _TimeoutError,
    )
    _patch_openai_response(monkeypatch, '{"message":"ok"}', error=_TimeoutError("timeout"))

    with pytest.raises(AgentInferenceRuntimeError) as exc:
        OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert exc.value.code == "RUNTIME_TIMEOUT"
    assert exc.value.details["runtime_name"] == "openai_compatible"


@pytest.mark.parametrize("kwargs", [{"timeout": "abc"}, {}])
def test_openai_adapter_rejects_invalid_timeout(monkeypatch, kwargs):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    if not kwargs:
        monkeypatch.setenv("AGENT_OPENAI_TIMEOUT_SECONDS", "abc")

    with pytest.raises(AgentInferenceRuntimeError) as exc:
        OpenAICompatibleRuntimeAdapter(**kwargs)

    assert exc.value.code == "RUNTIME_CONFIG_INVALID"
    assert exc.value.details["runtime_name"] == "openai_compatible"


def test_openai_adapter_accepts_numeric_string_timeout_without_network(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    clients = _patch_openai_response(monkeypatch, '{"message":"ok"}')

    OpenAICompatibleRuntimeAdapter(timeout="30").invoke(_request())

    assert clients[0].kwargs["timeout"] == 30.0


def test_openai_adapter_serializes_non_json_native_context_values(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    clients = _patch_openai_response(monkeypatch, '{"message":"ok"}')
    request = replace(
        _request(),
        context_pack={"generated_at": datetime(2026, 5, 25, 18, 40)},
    )

    result = OpenAICompatibleRuntimeAdapter().invoke(request)

    assert result.status == "succeeded"
    user_message = clients[0].create_kwargs["messages"][1]["content"]
    assert "2026-05-25 18:40:00" in user_message
