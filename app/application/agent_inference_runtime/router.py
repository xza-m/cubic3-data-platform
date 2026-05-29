"""Agent 推理 Runtime 路由。"""
from __future__ import annotations

from typing import Iterable, List

from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest, RuntimeName


class AgentInferenceRuntimeRouter:
    def __init__(
        self,
        *,
        adapters: Iterable[AgentInferenceRuntimePort],
        action_bindings: ActionRuntimeBindingRegistry | None = None,
    ):
        self._adapters: List[AgentInferenceRuntimePort] = list(adapters)
        self._action_bindings = action_bindings or ActionRuntimeBindingRegistry()

    def select(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimePort:
        binding = self._action_bindings.resolve(request.action)
        desired = request.preferred_runtime or binding.default_runtime
        if desired not in binding.allowed_runtimes:
            raise AgentInferenceRuntimeError(
                f"runtime={desired} is not allowed for action={request.action}",
                code="RUNTIME_NOT_ALLOWED_FOR_ACTION",
                details={
                    "action": request.action,
                    "runtime_name": desired,
                    "allowed_runtimes": binding.allowed_runtimes,
                },
            )
        for adapter in self._adapters:
            if adapter.runtime_name == desired and adapter.can_handle(request):
                return adapter
        raise AgentInferenceRuntimeError(
            f"no runtime adapter for action={request.action} runtime={desired}",
            code="RUNTIME_ADAPTER_NOT_FOUND",
            details={"action": request.action, "runtime_name": desired},
        )

    @classmethod
    def _default_runtime(cls, action: str) -> RuntimeName:
        return ActionRuntimeBindingRegistry().resolve(action).default_runtime
