"""
LLM 端口接口定义

定义 Agent 核心与 LLM 提供商之间的契约。
Infrastructure 层的适配器（OpenAI、Claude 等）实现此接口。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    """LLM 返回的工具调用请求"""

    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """LLM 统一响应体，各 Adapter 负责将厂商格式映射为此结构"""

    content: str | None                             # 文本回复（stop_reason=end_turn 时）
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: str = "end_turn"                   # "end_turn" | "tool_use"
    usage: dict[str, Any] = field(default_factory=dict)


class ILLMPort(ABC):
    """
    LLM 端口接口

    Agent Loop 通过此接口与 LLM 交互，不感知具体厂商实现。
    """

    @abstractmethod
    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        """
        发送消息并获取 LLM 响应

        Args:
            messages: 对话消息列表（含 system/user/assistant/tool 角色）
            tools: 可用工具的 JSON Schema 定义列表（function calling）
            temperature: 生成温度（0.0 = 确定性输出）

        Returns:
            统一格式的 LLM 响应
        """
        ...
