"""Agent 推理 Runtime 路由。"""
from __future__ import annotations

from typing import Iterable, List

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest


class AgentInferenceRuntimeRouter:
    _CODEX_ACTIONS = {
        "review",
        "review_proposal",
        "repair",
        "repair_validation_failure",
        "audit",
        "batch_audit",
    }
    _CODEX_ACTION_PREFIXES = ("review_", "repair_", "audit_")

    def __init__(self, *, adapters: Iterable[AgentInferenceRuntimePort]):
        self._adapters: List[AgentInferenceRuntimePort] = list(adapters)

    def select(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimePort:
        desired = request.preferred_runtime or self._default_runtime(request.action)
        for adapter in self._adapters:
            if adapter.runtime_name == desired and adapter.can_handle(request):
                return adapter
        raise AgentInferenceRuntimeError(
            f"no runtime adapter for action={request.action} runtime={desired}",
            code="RUNTIME_ADAPTER_NOT_FOUND",
            details={"action": request.action, "runtime_name": desired},
        )

    @classmethod
    def _default_runtime(cls, action: str) -> str:
        action_name = action.rsplit(".", 1)[-1]
        if action_name in cls._CODEX_ACTIONS or action_name.startswith(cls._CODEX_ACTION_PREFIXES):
            return "codex_app_server"
        return "openai_compatible"
