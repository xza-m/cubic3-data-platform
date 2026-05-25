"""Agent 推理 Runtime 端口。"""
from __future__ import annotations

from typing import Protocol

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class AgentInferenceRuntimePort(Protocol):
    runtime_name: str

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        ...

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        ...
