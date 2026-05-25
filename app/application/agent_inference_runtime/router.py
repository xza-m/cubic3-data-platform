"""Agent 推理 Runtime 路由。"""
from __future__ import annotations

from typing import Iterable, List

from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest


class AgentInferenceRuntimeRouter:
    def __init__(self, *, adapters: Iterable[AgentInferenceRuntimePort]):
        self._adapters: List[AgentInferenceRuntimePort] = list(adapters)

    def select(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimePort:
        desired = request.preferred_runtime or self._default_runtime(request.action)
        for adapter in self._adapters:
            if adapter.runtime_name == desired and adapter.can_handle(request):
                return adapter
        if request.preferred_runtime is None:
            for adapter in self._adapters:
                if adapter.can_handle(request):
                    return adapter
        raise ValueError(f"no runtime adapter for action={request.action} runtime={desired}")

    @staticmethod
    def _default_runtime(action: str) -> str:
        if any(token in action for token in ("review", "repair", "audit")):
            return "codex_app_server"
        return "openai_compatible"
