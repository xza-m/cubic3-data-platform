"""平台级 Agent 推理 Runtime 服务（单前门）。

- 同步平面 invoke：经 router 按 action 选 adapter。
- 异步平面 submit_run/poll：经 CodexRunService 长跑生命周期。
binding.kind 是平面权威：调错平面抛 RUNTIME_KIND_MISMATCH，杜绝消费方持多句柄自行分流。
"""
from __future__ import annotations

from typing import Any

from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    ExecutionMode,
)


class AgentInferenceRuntimeService:
    def __init__(
        self,
        *,
        router: AgentInferenceRuntimeRouter,
        run_service: Any | None = None,
        bindings: ActionRuntimeBindingRegistry | None = None,
        provider_factory: Any | None = None,
    ):
        self._router = router
        self._run_service = run_service
        self._bindings = bindings or ActionRuntimeBindingRegistry()
        self._provider_factory = provider_factory

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        self._assert_kind(request.action, "sync")
        adapter = self._router.select(request)
        return adapter.invoke(request)

    def chat(
        self,
        action: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.0,
        preferred_runtime: str | None = None,
    ) -> Any:
        """同步工具调用对话(LLMResponse)：按 action 选 provider 后调用其 ILLMPort.chat。"""
        self._assert_kind(action, "sync")
        adapter = self._sync_adapter(action, preferred_runtime)
        return adapter.chat(messages, tools, temperature)

    def complete(
        self,
        action: str,
        prompt: str,
        *,
        preferred_runtime: str | None = None,
    ) -> str:
        """同步单次补全：按 action 选 provider，单条 user 消息取文本回复。"""
        self._assert_kind(action, "sync")
        adapter = self._sync_adapter(action, preferred_runtime)
        response = adapter.chat([{"role": "user", "content": prompt}])
        return response.content or ""

    def _sync_adapter(self, action: str, preferred_runtime: str | None) -> Any:
        if self._provider_factory is None:
            raise AgentInferenceRuntimeError(
                "sync provider factory is not configured",
                code="SYNC_PROVIDER_UNAVAILABLE",
            )
        binding = self._bindings.resolve(action)
        chosen = preferred_runtime or binding.default_runtime
        if chosen not in binding.allowed_runtimes:
            raise AgentInferenceRuntimeError(
                f"runtime={chosen} is not allowed for action={action}",
                code="RUNTIME_NOT_ALLOWED_FOR_ACTION",
                details={
                    "action": action,
                    "runtime_name": chosen,
                    "allowed_runtimes": binding.allowed_runtimes,
                },
            )
        return self._provider_factory(chosen)

    def submit_run(self, request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
        self._assert_kind(request.action, "async")
        return self._resolve_run_service().submit(request)

    def poll(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        return self._resolve_run_service().poll(run_id, principal_id)

    def _assert_kind(self, action: str, expected: ExecutionMode) -> None:
        kind = self._bindings.resolve(action).kind
        if kind != expected:
            raise AgentInferenceRuntimeError(
                f"action={action} 属 {kind} 平面，不能用 {expected} 入口",
                code="RUNTIME_KIND_MISMATCH",
                details={"action": action, "kind": kind, "expected": expected},
            )

    def _resolve_run_service(self) -> Any:
        rs = self._run_service
        if rs is None:
            raise AgentInferenceRuntimeError(
                "async runtime is not configured",
                code="ASYNC_RUNTIME_UNAVAILABLE",
            )
        # 支持注入「callable 工厂」(每次读当前配置) 或「实例」两种形态。
        if callable(rs) and not hasattr(rs, "submit"):
            return rs()
        return rs
