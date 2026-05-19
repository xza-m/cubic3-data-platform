"""建模 Copilot 会话状态机。"""
from __future__ import annotations

from typing import Literal


CopilotSessionState = Literal[
    "created",
    "analyzing",
    "awaiting_confirmation",
    "spec_ready",
    "proposal_saved",
    "publishing",
    "published",
    "blocked",
    "abandoned",
]


class InvalidCopilotStateTransition(ValueError):
    """会话状态转移不合法。"""


class CopilotStateConflict(ValueError):
    """持久化时检测到 state_version 冲突。"""


ALLOWED_TRANSITIONS: dict[CopilotSessionState, set[CopilotSessionState]] = {
    "created": {
        "analyzing",
        "awaiting_confirmation",
        "spec_ready",
        "proposal_saved",
        "published",
        "blocked",
        "abandoned",
    },
    "analyzing": {"awaiting_confirmation", "spec_ready", "proposal_saved", "blocked", "abandoned"},
    "awaiting_confirmation": {"analyzing", "spec_ready", "blocked", "abandoned"},
    "spec_ready": {"analyzing", "proposal_saved", "blocked", "abandoned"},
    "proposal_saved": {"spec_ready", "publishing", "published", "blocked", "abandoned"},
    "publishing": {"published", "blocked"},
    "published": set(),
    "blocked": {"analyzing", "awaiting_confirmation", "spec_ready", "proposal_saved", "abandoned"},
    "abandoned": set(),
}


def assert_transition_allowed(
    from_state: CopilotSessionState,
    to_state: CopilotSessionState,
) -> None:
    if from_state == to_state:
        return
    if to_state not in ALLOWED_TRANSITIONS[from_state]:
        raise InvalidCopilotStateTransition(
            f"invalid Copilot state transition: {from_state} -> {to_state}"
        )
