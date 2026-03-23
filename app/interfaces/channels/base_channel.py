"""
信道适配器基类

定义所有信道（飞书、DataChat 等）的统一接口。
信道适配器位于 interfaces 层，负责将外部输入转换为领域对象，
并将 Agent 输出适配为信道特定格式。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.domain.agent.entities import AgentRequest, AgentResponse


class ChannelAdapter(ABC):
    """信道适配器抽象基类"""

    @abstractmethod
    def to_agent_request(self, raw_input: Any) -> AgentRequest:
        """将信道原始输入转换为统一 AgentRequest"""
        ...

    @abstractmethod
    def deliver_response(self, response: AgentResponse, **kwargs: Any) -> Any:
        """将 AgentResponse 适配为信道特定的输出格式"""
        ...
