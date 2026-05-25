from __future__ import annotations

from dataclasses import replace

import pytest

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.application.agent_inference_runtime.service import AgentInferenceRuntimeService
from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    RuntimeContextRef,
    RuntimePolicy,
)


class _FakeAdapter(AgentInferenceRuntimePort):
    runtime_name = "fake"

    def __init__(self):
        self.requests = []

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return request.preferred_runtime in {None, "fake"}

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        self.requests.append(request)
        return AgentInferenceRuntimeResult(
            run_id="run_fake_1",
            status="succeeded",
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output={
                "message": "已生成候选建议",
                "workbench_state_patch": {"agent_message": "已生成候选建议"},
                "proposal_patch": {"source_mode": "agent_led"},
            },
            artifacts=[],
            usage={"total_tokens": 0},
            trace=[{"event_type": "run.succeeded", "seq": 1}],
            error=None,
        )


def _request(action: str = "semantic.modeling.chat") -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action=action,
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="session_1",
            thread_id="thread_1",
            turn_id="turn_1",
        ),
        principal_id="alice",
        input={"message": "查询学生评论数"},
        context_pack={"session": {"id": "session_1"}},
        output_schema="semantic.modeling.chat.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime=None,
        execution_mode="sync",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_service_routes_request_to_fake_runtime_and_returns_trace():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])
    service = AgentInferenceRuntimeService(router=router)
    request = replace(_request(), preferred_runtime="fake")

    result = service.invoke(request)

    assert result.status == "succeeded"
    assert result.runtime_name == "fake"
    assert result.structured_output["message"] == "已生成候选建议"
    assert adapter.requests[0].runtime_context_ref.session_id == "session_1"


def test_router_rejects_unknown_runtime_without_silent_fallback():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])
    request = replace(_request(), preferred_runtime="unknown_runtime")

    with pytest.raises(AgentInferenceRuntimeError, match="no runtime adapter") as exc_info:
        router.select(request)

    assert exc_info.value.code == "RUNTIME_ADAPTER_NOT_FOUND"
    assert exc_info.value.details == {
        "action": "semantic.modeling.chat",
        "runtime_name": "unknown_runtime",
    }


def test_router_rejects_missing_default_runtime_without_fallback():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])

    with pytest.raises(AgentInferenceRuntimeError, match="no runtime adapter") as exc_info:
        router.select(_request("semantic.modeling.chat"))

    assert exc_info.value.code == "RUNTIME_ADAPTER_NOT_FOUND"
    assert exc_info.value.details == {
        "action": "semantic.modeling.chat",
        "runtime_name": "openai_compatible",
    }


def test_router_defaults_review_action_to_codex_when_adapter_exists():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_app_server"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[openai, codex])

    selected = router.select(_request("semantic.modeling.review_proposal"))

    assert selected.runtime_name == "codex_app_server"


def test_router_defaults_preview_action_to_openai_not_codex():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_app_server"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[codex, openai])

    selected = router.select(_request("semantic.modeling.preview_candidate"))

    assert selected.runtime_name == "openai_compatible"
