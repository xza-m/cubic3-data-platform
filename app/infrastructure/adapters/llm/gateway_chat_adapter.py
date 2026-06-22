"""把 ILLMPort.chat 路由到统一前门(AgentInferenceRuntimeService)的薄适配器。

让既有 ILLMPort 消费方(如 AgentLoopService)无需改动即可经前门按 action 选 provider，
配置走 management_config（单一事实源，UI 改后 live 生效）。
"""
from __future__ import annotations

from typing import Any

from app.domain.agent.ports.llm_port import ILLMPort, LLMResponse


class GatewayChatAdapter(ILLMPort):
    def __init__(self, *, gateway: Any, action: str) -> None:
        self._gateway = gateway
        self._action = action

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        return self._gateway.chat(
            self._action, messages, tools, temperature=temperature
        )
