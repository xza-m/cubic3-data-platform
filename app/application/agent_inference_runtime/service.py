"""平台级 Agent 推理 Runtime 服务。"""
from __future__ import annotations

from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class AgentInferenceRuntimeService:
    def __init__(self, *, router: AgentInferenceRuntimeRouter):
        self._router = router

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        adapter = self._router.select(request)
        return adapter.invoke(request)
