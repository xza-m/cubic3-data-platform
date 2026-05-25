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
            "session": session.model_dump(mode="json"),
            "latest_user_message": user_message,
            "request_payload": deepcopy(payload),
            "workbench_state": deepcopy(session.workbench_state or {}),
            "conversation_tail": [
                message.model_dump(mode="json") for message in conversation_tail
            ],
            "evidence": [],
        }
