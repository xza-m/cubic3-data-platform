"""语义建模 Copilot 会话模型。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


AgentSessionStatus = Literal["active", "completed", "abandoned"]
AgentSessionEntryType = Literal["table_known", "business_question", "semantic_gap"]


class AgentSessionMessage(BaseModel):
    """建模 Copilot 的一条会话消息。"""

    role: Literal["user", "assistant", "system"] = "user"
    content: str
    created_at: str = Field(default_factory=lambda: _utc_now())


class AgentSession(BaseModel):
    """用户与建模 Copilot 协作的构建期会话，不作为 Runtime 语义源。"""

    id: str
    user_goal: str
    entry_type: AgentSessionEntryType = "business_question"
    status: AgentSessionStatus = "active"
    principal_id: Optional[str] = None
    title: Optional[str] = None
    conversation: List[AgentSessionMessage] = Field(default_factory=list)
    working_memory: Dict[str, Any] = Field(
        default_factory=lambda: {
            "confirmed_assumptions": [],
            "open_questions": [],
            "rejected_candidates": [],
        }
    )
    current_proposal_id: Optional[str] = None
    workbench_state: Dict[str, Any] = Field(default_factory=dict)
    tool_traces: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    def add_message(self, *, role: Literal["user", "assistant", "system"], content: str) -> None:
        self.conversation.append(AgentSessionMessage(role=role, content=content))
        self.touch()

    def touch(self) -> None:
        self.updated_at = _utc_now()


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
