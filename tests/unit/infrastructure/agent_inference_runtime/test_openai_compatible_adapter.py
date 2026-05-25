from __future__ import annotations

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

    class _Completion:
        choices = [
            type("Choice", (), {"message": type("Msg", (), {"content": '{"message":"ok"}'})()})
        ]
        usage = type("Usage", (), {"model_dump": lambda self: {"total_tokens": 7}})()

    class _Client:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.chat = type(
                "Chat",
                (),
                {
                    "completions": type(
                        "Completions",
                        (),
                        {"create": lambda *_args, **_kwargs: _Completion()},
                    )()
                },
            )()

    monkeypatch.setattr(
        "app.infrastructure.agent_inference_runtime.openai_compatible_adapter.OpenAI",
        _Client,
    )

    result = OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert result.status == "succeeded"
    assert result.runtime_name == "openai_compatible"
    assert result.structured_output == {"message": "ok"}
    assert result.usage == {"total_tokens": 7}
