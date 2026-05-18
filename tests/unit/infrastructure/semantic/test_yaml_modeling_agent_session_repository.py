"""YamlModelingAgentSessionRepository 单元测试。"""
from __future__ import annotations

import pytest

from app.domain.semantic.modeling_agent_session import AgentSession
from app.infrastructure.semantic.yaml_modeling_agent_session_repository import (
    YamlModelingAgentSessionRepository,
)


def _make(session_id: str, *, principal_id=None, status="active", title=None) -> AgentSession:
    return AgentSession(
        id=session_id,
        user_goal=f"goal of {session_id}",
        principal_id=principal_id,
        status=status,
        title=title,
    )


def test_save_and_get_roundtrip(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    repo.save(_make("s_alice_1", principal_id="alice"))
    fetched = repo.get("s_alice_1")
    assert fetched is not None
    assert fetched.principal_id == "alice"
    assert fetched.user_goal == "goal of s_alice_1"


def test_list_filters_by_principal_with_legacy_visible(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    repo.save(_make("s_alice", principal_id="alice"))
    repo.save(_make("s_bob", principal_id="bob"))
    repo.save(_make("s_legacy"))  # 无 principal_id

    listed_alice = repo.list(principal_id="alice")
    ids = {s.id for s in listed_alice}
    assert ids == {"s_alice", "s_legacy"}

    strict = repo.list(principal_id="alice", include_legacy=False)
    assert {s.id for s in strict} == {"s_alice"}

    listed_all = repo.list(principal_id=None)
    assert {s.id for s in listed_all} == {"s_alice", "s_bob", "s_legacy"}


def test_list_orders_by_updated_at_desc(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    s_old = _make("s_old", principal_id="alice")
    s_old.updated_at = "2024-01-01T00:00:00Z"
    repo.save(s_old)
    # 直接覆盖 updated_at；save 内部会调 touch，需要再手动改文件以验证排序
    s_new = _make("s_new", principal_id="alice")
    repo.save(s_new)
    # save 之后 touch 已写入更新时间。再加载一次校验顺序
    repo._loaded = False  # noqa: SLF001 - 测试中刷新缓存
    listed = repo.list(principal_id="alice")
    assert [s.id for s in listed][0] == "s_new"


def test_list_supports_status_filter_offset_and_limit(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    for i in range(5):
        repo.save(_make(f"s_{i}", principal_id="alice"))
    # 把 s_2 状态改成 abandoned
    s2 = repo.get("s_2")
    s2.status = "abandoned"
    repo.save(s2)

    active = repo.list(principal_id="alice", status="active")
    assert {s.id for s in active} == {"s_0", "s_1", "s_3", "s_4"}

    page = repo.list(principal_id="alice", limit=2, offset=1)
    assert len(page) == 2


def test_delete_removes_file_and_cache(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    repo.save(_make("s_target", principal_id="alice"))
    assert repo.get("s_target") is not None
    repo.delete("s_target")
    assert repo.get("s_target") is None
    # 幂等：重复删除不抛
    repo.delete("s_target")


def test_update_metadata_renames_session(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    repo.save(_make("s_rename", principal_id="alice", title="原始"))
    updated = repo.update_metadata("s_rename", title="新名称")
    assert updated is not None
    assert updated.title == "新名称"

    # 传入空字符串视作清空
    cleared = repo.update_metadata("s_rename", title="   ")
    assert cleared.title is None


def test_update_metadata_returns_none_when_missing(tmp_path):
    repo = YamlModelingAgentSessionRepository(str(tmp_path / "sessions"))
    assert repo.update_metadata("s_missing", title="x") is None
