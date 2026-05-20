from __future__ import annotations

import pytest

from app.domain.semantic.copilot_state import CopilotStateConflict, InvalidCopilotStateTransition
from app.domain.semantic.modeling_agent_session import AgentSession


def test_agent_session_state_transition_increments_version_and_records_history():
    session = AgentSession(id="s_1", user_goal="查询学生评论数")

    session.transition_state(
        "awaiting_confirmation",
        actor="copilot",
        reason="required_business_confirmation",
    )

    assert session.state == "awaiting_confirmation"
    assert session.state_version == 2
    assert session.state_history[-1]["from_state"] == "created"
    assert session.state_history[-1]["to_state"] == "awaiting_confirmation"
    assert session.state_history[-1]["reason"] == "required_business_confirmation"
    assert session.event_log[-1]["type"] == "state_transition"
    assert session.event_log[-1]["action"] == "created_to_awaiting_confirmation"
    assert session.event_log[-1]["payload"]["state_version"] == 2


def test_agent_session_rejects_invalid_transition_after_published():
    session = AgentSession(id="s_1", user_goal="查询学生评论数")
    session.transition_state("spec_ready", actor="copilot")
    session.transition_state("proposal_saved", actor="copilot")
    session.transition_state("published", actor="copilot")

    with pytest.raises(InvalidCopilotStateTransition):
        session.transition_state("spec_ready", actor="copilot")


def test_agent_session_state_version_conflict_is_explicit():
    session = AgentSession(id="s_1", user_goal="查询学生评论数")

    session.assert_state_version(1)

    with pytest.raises(CopilotStateConflict, match="expected state_version=0"):
        session.assert_state_version(0)
