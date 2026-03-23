"""
LLM 适配器基类

为 ILLMPort 的基础设施实现提供公共逻辑（日志、超时、重试等）。
"""
from __future__ import annotations

from typing import Any

from app.domain.agent.ports.llm_port import ILLMPort, LLMResponse
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class BaseLLMAdapter(ILLMPort):
    """
    LLM 适配器基类

    子类需实现 chat() 方法，基类提供公共的日志和配置管理。
    """

    def __init__(
        self,
        api_key: str,
        api_base: str,
        model: str,
        timeout: int = 60,
    ):
        self.api_key = api_key
        self.api_base = api_base.rstrip('/')
        self.model = model
        self.timeout = timeout

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        raise NotImplementedError("子类须实现 chat()")

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model!r}, api_base={self.api_base!r})"
