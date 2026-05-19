"""语义建模 Copilot 会话模型。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.domain.semantic.copilot_state import (
    CopilotSessionState,
    CopilotStateConflict,
    assert_transition_allowed,
)


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
    state: CopilotSessionState = "created"
    state_version: int = 1
    state_history: List[Dict[str, Any]] = Field(default_factory=list)
    event_log: List[Dict[str, Any]] = Field(default_factory=list)
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

    def transition_state(
        self,
        to_state: CopilotSessionState,
        *,
        actor: str | None = None,
        reason: str | None = None,
    ) -> None:
        if self.state == to_state:
            return
        assert_transition_allowed(self.state, to_state)
        from_state = self.state
        self.state = to_state
        self.state_version += 1
        if to_state == "published":
            self.status = "completed"
        elif to_state == "abandoned":
            self.status = "abandoned"
        elif self.status == "completed":
            self.status = "active"
        self.state_history.append(
            {
                "from_state": from_state,
                "to_state": to_state,
                "actor": actor,
                "reason": reason,
                "state_version": self.state_version,
                "created_at": _utc_now(),
            }
        )
        self.record_event(
            "state_transition",
            actor=actor,
            action=f"{from_state}_to_{to_state}",
            payload={
                "from_state": from_state,
                "to_state": to_state,
                "reason": reason,
                "state_version": self.state_version,
            },
        )
        self.touch()

    def assert_state_version(self, expected_state_version: int) -> None:
        if self.state_version != expected_state_version:
            raise CopilotStateConflict(
                f"expected state_version={expected_state_version}, actual={self.state_version}"
            )

    def record_event(
        self,
        event_type: str,
        *,
        actor: str | None = None,
        action: str | None = None,
        idempotency_key: str | None = None,
        payload: Dict[str, Any] | None = None,
    ) -> None:
        event: Dict[str, Any] = {
            "type": event_type,
            "actor": actor,
            "action": action,
            "state": self.state,
            "state_version": self.state_version,
            "created_at": _utc_now(),
        }
        if idempotency_key:
            event["idempotency_key"] = idempotency_key
        if payload:
            event["payload"] = payload
        self.event_log.append(event)

    def touch(self) -> None:
        self.updated_at = _utc_now()


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
