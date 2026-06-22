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
    ):
        self._router = router
        self._run_service = run_service
        self._bindings = bindings or ActionRuntimeBindingRegistry()

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        self._assert_kind(request.action, "sync")
        adapter = self._router.select(request)
        return adapter.invoke(request)

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
