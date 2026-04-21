# tests/unit/infrastructure/queries/test_scheduled_query_repo.py
"""
单元测试：ScheduledQueryRepo 边缘分支覆盖

覆盖目标行（repo 层）：
  - update: sq is None → return None（47）
  - delete: sq is None → return False（57）
  - list_enabled（63）
  - finish_run: run is None → return None（108）
  - update_query_last_run: sq is None → return（124）
"""
import pytest
from datetime import datetime

from app.infrastructure.queries.scheduled_query_repo import ScheduledQueryRepo


@pytest.mark.redesign
class TestRepoUpdateNotFound:

    def test_update_nonexistent_returns_none(self, app, db_session):
        """更新不存在的 query → None（覆盖行 47）"""
        repo = ScheduledQueryRepo()
        result = repo.update(999999, {"name": "ghost"})
        assert result is None


@pytest.mark.redesign
class TestRepoDeleteNotFound:

    def test_delete_nonexistent_returns_false(self, app, db_session):
        """删除不存在的 query → False（覆盖行 57）"""
        repo = ScheduledQueryRepo()
        result = repo.delete(999999)
        assert result is False


@pytest.mark.redesign
class TestRepoListEnabled:

    def test_list_enabled_empty(self, app, db_session):
        """无 enabled 记录 → 空列表（覆盖行 63）"""
        repo = ScheduledQueryRepo()
        result = repo.list_enabled()
        assert result == []

    def test_list_enabled_filters_correctly(self, app, db_session):
        """仅返回 enabled=True 的记录"""
        repo = ScheduledQueryRepo()
        repo.create({
            "name": "q_enabled", "sql": "SELECT 1",
            "datasource_id": 1, "cron": "0 9 * * 1",
            "timezone": "Asia/Shanghai", "enabled": True, "owner_id": "u1",
        })
        repo.create({
            "name": "q_disabled", "sql": "SELECT 2",
            "datasource_id": 1, "cron": "0 9 * * 2",
            "timezone": "Asia/Shanghai", "enabled": False, "owner_id": "u1",
        })
        result = repo.list_enabled()
        assert len(result) == 1
        assert result[0].name == "q_enabled"


@pytest.mark.redesign
class TestRepoFinishRunNotFound:

    def test_finish_run_nonexistent_returns_none(self, app, db_session):
        """finish_run 不存在的 run → None（覆盖行 108）"""
        repo = ScheduledQueryRepo()
        result = repo.finish_run(999999, status="success")
        assert result is None


@pytest.mark.redesign
class TestRepoUpdateQueryLastRunNotFound:

    def test_update_query_last_run_nonexistent(self, app, db_session):
        """update_query_last_run 不存在的 query → 静默返回（覆盖行 124）"""
        repo = ScheduledQueryRepo()
        repo.update_query_last_run(999999, last_run_at=datetime.utcnow(), last_status="success")
