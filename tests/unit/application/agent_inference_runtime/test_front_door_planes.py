"""前门双平面(同步 invoke / 异步 submit_run)+ binding.kind 平面校验测试。"""
from __future__ import annotations

from dataclasses import replace

import pytest

from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
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
    runtime_name = "openai_compatible"

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return request.preferred_runtime in {None, self.runtime_name}

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        return AgentInferenceRuntimeResult(
            run_id="run_1",
            status="succeeded",
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output={},
            artifacts=[],
            usage={},
            trace=[],
            error=None,
        )


class _FakeRunService:
    def __init__(self):
        self.submitted = []
        self.polled = []

    def submit(self, request):
        self.submitted.append(request)
        return {"run_id": "run_async_1", "status": "queued"}

    def poll(self, run_id, principal_id=None):
        self.polled.append((run_id, principal_id))
        return {"run_id": run_id, "status": "running"}


def _request(action: str, *, execution_mode="sync", preferred_runtime=None) -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action=action,
        runtime_context_ref=RuntimeContextRef(
            project_id="p", session_id="s", thread_id="t", turn_id="u",
        ),
        principal_id="alice",
        input={},
        context_pack={},
        output_schema="x.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime=preferred_runtime,
        execution_mode=execution_mode,
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


class _FakeResponse:
    def __init__(self, content):
        self.content = content
        self.tool_calls = []


class _FakeLLM:
    def __init__(self, content="结果文本"):
        self.content = content
        self.calls = []

    def chat(self, messages, tools=None, temperature=0.0):
        self.calls.append((messages, tools, temperature))
        return _FakeResponse(self.content)


def _service(run_service=None, provider_factory=None):
    return AgentInferenceRuntimeService(
        router=AgentInferenceRuntimeRouter(adapters=[_FakeAdapter()]),
        run_service=run_service,
        bindings=ActionRuntimeBindingRegistry(),
        provider_factory=provider_factory,
    )


class TestBindingKind:
    def test_codex_action_is_async(self):
        b = ActionRuntimeBindingRegistry().resolve("semantic.modeling.review_proposal")
        assert b.kind == "async"

    def test_openai_actions_are_sync(self):
        reg = ActionRuntimeBindingRegistry()
        assert reg.resolve("semantic.modeling.generate_candidates").kind == "sync"
        assert reg.resolve("semantic.modeling.chat").kind == "sync"
        assert reg.resolve("semantic.modeling.expert_debug").kind == "sync"
        assert reg.resolve("unknown.action").kind == "sync"


class TestSyncPlane:
    def test_invoke_routes_sync_action(self):
        result = _service().invoke(_request("semantic.modeling.chat"))
        assert result.status == "succeeded"

    def test_invoke_rejects_async_action_kind_mismatch(self):
        with pytest.raises(AgentInferenceRuntimeError) as exc:
            _service().invoke(_request("semantic.modeling.review_proposal", execution_mode="async"))
        assert exc.value.code == "RUNTIME_KIND_MISMATCH"


class TestAsyncPlane:
    def test_submit_run_routes_async_action_to_run_service(self):
        rs = _FakeRunService()
        out = _service(rs).submit_run(
            _request("semantic.modeling.review_proposal", execution_mode="async", preferred_runtime="codex_sdk")
        )
        assert out == {"run_id": "run_async_1", "status": "queued"}
        assert len(rs.submitted) == 1

    def test_submit_run_rejects_sync_action_kind_mismatch(self):
        with pytest.raises(AgentInferenceRuntimeError) as exc:
            _service(_FakeRunService()).submit_run(_request("semantic.modeling.chat"))
        assert exc.value.code == "RUNTIME_KIND_MISMATCH"

    def test_submit_run_without_run_service_raises(self):
        with pytest.raises(AgentInferenceRuntimeError) as exc:
            _service(None).submit_run(
                _request("semantic.modeling.review_proposal", execution_mode="async")
            )
        assert exc.value.code == "ASYNC_RUNTIME_UNAVAILABLE"

    def test_submit_run_accepts_callable_factory(self):
        rs = _FakeRunService()
        out = _service(lambda: rs).submit_run(
            _request("semantic.modeling.repair_validation_failure", execution_mode="async")
        )
        assert out["status"] == "queued"
        assert len(rs.submitted) == 1

    def test_poll_delegates_to_run_service(self):
        rs = _FakeRunService()
        out = _service(rs).poll("run_x", "alice")
        assert out == {"run_id": "run_x", "status": "running"}
        assert rs.polled == [("run_x", "alice")]


class TestSyncProviderMethods:
    def test_complete_wraps_prompt_and_returns_content(self):
        llm = _FakeLLM("销售额 地区")
        out = _service(provider_factory=lambda name: llm).complete(
            "global_ask.intent_extract", "各区域卖得怎样"
        )
        assert out == "销售额 地区"
        assert llm.calls[0][0] == [{"role": "user", "content": "各区域卖得怎样"}]

    def test_chat_passes_messages_tools_and_returns_response(self):
        llm = _FakeLLM()
        resp = _service(provider_factory=lambda name: llm).chat(
            "agent.loop", [{"role": "user", "content": "hi"}], tools=[{"name": "q"}], temperature=0.0
        )
        assert resp.content == "结果文本"
        assert llm.calls[0][1] == [{"name": "q"}]

    def test_complete_without_provider_factory_raises(self):
        with pytest.raises(AgentInferenceRuntimeError) as exc:
            _service().complete("global_ask.intent_extract", "q")
        assert exc.value.code == "SYNC_PROVIDER_UNAVAILABLE"

    def test_complete_rejects_async_action_kind_mismatch(self):
        with pytest.raises(AgentInferenceRuntimeError) as exc:
            _service(provider_factory=lambda name: _FakeLLM()).complete(
                "semantic.modeling.review_proposal", "q"
            )
        assert exc.value.code == "RUNTIME_KIND_MISMATCH"

    def test_sync_adapter_rejects_runtime_not_allowed(self):
        # 固定 openai 的 action 不允许 preferred=codex_sdk
        with pytest.raises(AgentInferenceRuntimeError) as exc:
            _service(provider_factory=lambda name: _FakeLLM()).complete(
                "semantic.modeling.generate_candidates", "q", preferred_runtime="codex_sdk"
            )
        assert exc.value.code == "RUNTIME_NOT_ALLOWED_FOR_ACTION"


class TestGatewayChatAdapter:
    def test_routes_illmport_chat_to_gateway_by_action(self):
        from app.infrastructure.adapters.llm.gateway_chat_adapter import GatewayChatAdapter

        calls = []

        class _GW:
            def chat(self, action, messages, tools=None, temperature=0.0):
                calls.append((action, messages, tools, temperature))
                return _FakeResponse("ok")

        adapter = GatewayChatAdapter(gateway=_GW(), action="agent.loop")
        out = adapter.chat([{"role": "user", "content": "hi"}], tools=[{"name": "q"}], temperature=0.0)

        assert out.content == "ok"
        assert calls == [("agent.loop", [{"role": "user", "content": "hi"}], [{"name": "q"}], 0.0)]
