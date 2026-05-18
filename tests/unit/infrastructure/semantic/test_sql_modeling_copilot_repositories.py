from __future__ import annotations

from app.domain.semantic.modeling_agent_session import AgentSession
from app.domain.semantic.modeling_proposal import ModelingProposal
from app.infrastructure.semantic.sql_modeling_agent_session_repository import (
    SqlModelingAgentSessionRepository,
)
from app.infrastructure.semantic.sql_modeling_proposal_repository import (
    SqlModelingProposalRepository,
)


def test_sql_modeling_agent_session_repository_round_trips_and_filters_by_principal(db_session):
    repo = SqlModelingAgentSessionRepository(db_session)
    alice = AgentSession(
        id="s_alice",
        user_goal="查询学生评论数",
        principal_id="alice",
        title="Alice 草稿",
        status="active",
    )
    bob = AgentSession(
        id="s_bob",
        user_goal="查询订单数",
        principal_id="bob",
        title="Bob 草稿",
        status="completed",
    )

    repo.save(alice)
    repo.save(bob)
    repo.update_metadata("s_alice", title="Alice 新标题")

    loaded = repo.get("s_alice")
    assert loaded is not None
    assert loaded.title == "Alice 新标题"
    assert loaded.principal_id == "alice"
    assert loaded.user_goal == "查询学生评论数"

    alice_items = repo.list(principal_id="alice", include_legacy=False)
    assert [item.id for item in alice_items] == ["s_alice"]
    assert repo.list(principal_id="alice", status="completed", include_legacy=False) == []

    repo.delete("s_alice")
    assert repo.get("s_alice") is None


def test_sql_modeling_proposal_repository_round_trips_payload(db_session):
    repo = SqlModelingProposalRepository(db_session)
    proposal = ModelingProposal(
        id="proposal_1",
        status="drafted",
        intent={"question": "查询学生评论数"},
        spec={"cube": {"name": "student_comment_cube"}},
        readiness_label="Ready to Apply",
    )

    repo.save(proposal)

    loaded = repo.get("proposal_1")
    assert loaded is not None
    assert loaded.status == "drafted"
    assert loaded.intent["question"] == "查询学生评论数"
    assert loaded.spec["cube"]["name"] == "student_comment_cube"

    loaded.status = "published"
    repo.save(loaded)
    assert repo.get("proposal_1").status == "published"
