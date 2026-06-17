"""建模 Copilot 会话状态机。"""
from __future__ import annotations

from typing import Any, Literal, Mapping, Optional


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


def is_reviewable_spec(value: Any) -> bool:
    """spec 可进入审阅/保存流程的最小判定（v1 + 非空 cube）。"""
    return (
        isinstance(value, dict)
        and str(value.get("spec_version") or "") == "v1"
        and isinstance(value.get("cube"), dict)
        and bool(value["cube"])
    )


def derive_session_state(
    *,
    status: str,
    workbench_state: Optional[Mapping[str, Any]],
    current_proposal_id: Optional[str],
    conversation_turns: int,
) -> CopilotSessionState:
    """从会话快照推导当前 FSM 状态。

    这是状态推导的唯一权威实现；应用层不应再各自维护推导逻辑。
    """
    if status == "abandoned":
        return "abandoned"
    state: Mapping[str, Any] = workbench_state or {}
    publish_result = state.get("publish_result")
    if isinstance(publish_result, dict):
        if publish_result.get("status") == "published":
            return "published"
        if publish_result.get("status") == "failed":
            return "blocked"
    advanced_refs = (
        state.get("advanced_refs") if isinstance(state.get("advanced_refs"), dict) else {}
    )
    if current_proposal_id or advanced_refs.get("proposal_id"):
        return "proposal_saved"
    if state.get("required_confirmations"):
        return "awaiting_confirmation"
    raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
    if is_reviewable_spec(raw_spec):
        return "spec_ready"
    canvas = state.get("semantic_canvas") if isinstance(state.get("semantic_canvas"), dict) else {}
    if conversation_turns > 1:
        return "analyzing"
    if state.get("candidate_cards") or any(
        canvas.get(key) for key in ("objects", "metrics", "bindings", "dimensions")
    ):
        return "analyzing"
    return "created"
