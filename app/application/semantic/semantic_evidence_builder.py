"""语义建模 Agent 的证据上下文构建器。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Mapping

from app.domain.semantic.modeling_agent_session import AgentSession


class SemanticEvidenceBuilder:
    """把当前会话压缩成 Runtime 可消费的上下文包。"""

    def __init__(self, *, conversation_tail_limit: int = 8):
        self._conversation_tail_limit = conversation_tail_limit

    def build(
        self,
        *,
        session: AgentSession,
        user_message: str,
        request_payload: Mapping[str, Any] | None = None,
    ) -> Dict[str, Any]:
        payload = dict(request_payload or {})
        conversation_tail = session.conversation[-self._conversation_tail_limit :]
        return {
            "session": _session_summary(session),
            "latest_user_message": user_message,
            "request_payload": deepcopy(payload),
            "workbench_state": deepcopy(session.workbench_state or {}),
            "conversation_tail": [
                message.model_dump(mode="json") for message in conversation_tail
            ],
            "evidence": [],
        }


def _session_summary(session: AgentSession) -> Dict[str, Any]:
    return {
        "id": session.id,
        "user_goal": session.user_goal,
        "entry_type": session.entry_type,
        "state": session.state,
        "status": session.status,
        "principal_id": session.principal_id,
        "current_proposal_id": session.current_proposal_id,
        "title": session.title,
    }
