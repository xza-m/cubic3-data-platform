"""
DataAgent 领域实体（值对象）

这些是 Agent 体系的核心数据结构，用于在各层之间传递数据。
与 ORM 实体不同，它们不需要持久化，使用 dataclass 定义。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentContext:
    """Agent 请求上下文，承载信道差异信息"""

    channel: str                                    # "feishu" | "datachat"
    user_id: str | None = None

    # 飞书信道（应用单聊 P2P）
    open_id: str | None = None
    chat_id: str | None = None
    message_id: str | None = None

    # DataChat 信道
    dataset_id: int | None = None
    conversation_id: int | None = None


@dataclass
class AgentRequest:
    """Agent 统一请求体"""

    message: str
    context: AgentContext
    history: list[dict[str, Any]] | None = None     # DataChat 信道传入最近 N 条历史


@dataclass
class AgentResponse:
    """Agent 统一响应体"""

    text: str
    sql: str | None = None
    data: list[list[Any]] | None = None
    columns: list[str] | None = None
    error: str | None = None
    usage: dict[str, Any] | None = None


@dataclass
class AgentStep:
    """Agent Loop 中间步骤（用于 on_progress 回调）"""

    tool_name: str
    status: str                                     # "running" | "completed"
    summary: str                                    # 人类可读的进度摘要
    details: dict[str, Any] = field(default_factory=dict)
