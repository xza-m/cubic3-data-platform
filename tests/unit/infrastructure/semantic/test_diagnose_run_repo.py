# tests/unit/infrastructure/semantic/test_diagnose_run_repo.py
"""DiagnoseRunRepo 基础设施层 DB 测试。"""
from datetime import datetime, timedelta

import pytest

from app.infrastructure.semantic.diagnose_run_repo import DiagnoseRunRepo


@pytest.fixture
def repo():
    return DiagnoseRunRepo()


def _run_data(**overrides):
    base = {
        "user_id": 1,
        "input_kind": "sql",
        "input_text": "SELECT 1",
        "parse_ok": True,
        "validate_ok": True,
        "sql_text": "SELECT 1",
        "error": None,
        "duration_ms": 10,
    }
    base.update(overrides)
    return base


class TestCreate:
    """create — 插入诊断记录。"""

    def test_creates_and_returns_entity(self, app, db_session, repo):
        """插入后返回的实体有 id 和 created_at。"""
        run = repo.create(_run_data())
        assert run.id is not None
        assert run.input_kind == "sql"


class TestGet:
    """get — 按 ID 查询。"""

    def test_existing_returns_entity(self, app, db_session, repo):
        """查询已存在的 run 返回实体。"""
        run = repo.create(_run_data())
        found = repo.get(run.id)
        assert found is not None
        assert found.id == run.id

    def test_nonexistent_returns_none(self, app, db_session, repo):
        """查询不存在的 run_id 返回 None。"""
        assert repo.get(999999) is None


class TestListWithFilter:
    """list — 带 user_id 过滤的分页查询。"""

    def test_filter_by_user_id(self, app, db_session, repo):
        """传入 user_id 时只返回该用户的记录。"""
        repo.create(_run_data(user_id=100))
        repo.create(_run_data(user_id=200))
        result = repo.list(user_id=100, page=1, page_size=20)
        assert result["total"] == 1
        assert all(item["user_id"] == 100 for item in result["items"])

    def test_list_without_user_id(self, app, db_session, repo):
        """user_id=None 时返回全部记录。"""
        repo.create(_run_data(user_id=100))
        repo.create(_run_data(user_id=200))
        result = repo.list(user_id=None, page=1, page_size=20)
        assert result["total"] == 2


class TestDeleteOlderThan:
    """delete_older_than — 删除过期记录。"""

    def test_deletes_old_records(self, app, db_session, repo):
        """删除 created_at < cutoff 的记录，返回删除行数。"""
        old = repo.create(_run_data())
        old_id = old.id
        old.created_at = datetime(2020, 1, 1)
        db_session.commit()
        new = repo.create(_run_data())
        new_id = new.id

        deleted = repo.delete_older_than(cutoff=datetime(2025, 1, 1))
        assert deleted == 1
        assert repo.get(old_id) is None
        assert repo.get(new_id) is not None

    def test_returns_zero_when_nothing_to_delete(self, app, db_session, repo):
        """cutoff 很早时不删除任何记录。"""
        repo.create(_run_data())
        deleted = repo.delete_older_than(cutoff=datetime(1990, 1, 1))
        assert deleted == 0
