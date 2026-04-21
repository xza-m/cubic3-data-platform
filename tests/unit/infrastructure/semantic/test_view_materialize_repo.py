# tests/unit/infrastructure/semantic/test_view_materialize_repo.py
"""ViewMaterializeRepository 基础设施层 DB 测试。"""
from datetime import datetime, timezone

import pytest

from app.infrastructure.semantic.view_materialize_repo import (
    ViewMaterializeRepository,
    _utcnow,
)
from app.domain.semantic.views_materialize import SemanticViewMaterializeRun


@pytest.fixture
def repo():
    return ViewMaterializeRepository()


class TestUtcnow:
    """模块级 _utcnow() 辅助函数。"""

    def test_returns_naive_utc(self):
        """返回 naive datetime（无 tzinfo），近似 UTC 当前时间。"""
        now = _utcnow()
        assert now.tzinfo is None
        assert abs((datetime.now(timezone.utc).replace(tzinfo=None) - now).total_seconds()) < 2


class TestCreateRun:
    """create_run — 插入 running 状态记录。"""

    def test_creates_running_record(self, app, db_session, repo):
        """插入记录后 status=running，started_at 非空。"""
        run = repo.create_run(view_id=42)
        assert run.id is not None
        assert run.status == "running"
        assert run.started_at is not None
        assert run.view_id == 42


class TestFinishRun:
    """finish_run — 标记成功或失败。"""

    def test_finish_success(self, app, db_session, repo):
        """成功完成后 status=idle，finished_at 非空。"""
        run = repo.create_run(view_id=1)
        repo.finish_run(run.id, success=True)
        updated = db_session.get(SemanticViewMaterializeRun, run.id)
        assert updated.status == "idle"
        assert updated.finished_at is not None

    def test_finish_failure_with_error(self, app, db_session, repo):
        """失败时 status=failed，error 字段有值。"""
        run = repo.create_run(view_id=1)
        repo.finish_run(run.id, success=False, error="timeout")
        updated = db_session.get(SemanticViewMaterializeRun, run.id)
        assert updated.status == "failed"
        assert updated.error == "timeout"

    def test_finish_nonexistent_run_noop(self, app, db_session, repo):
        """run_id 不存在时静默返回，无异常。"""
        repo.finish_run(999999, success=True)


class TestListRuns:
    """list_runs — 分页查询。"""

    def test_returns_paginated_result(self, app, db_session, repo):
        """插入 3 条记录后分页返回正确结构。"""
        for _ in range(3):
            repo.create_run(view_id=10)
        result = repo.list_runs(view_id=10, page=1, page_size=2)
        assert result["total"] == 3
        assert len(result["items"]) == 2
        assert result["page"] == 1

    def test_empty_result(self, app, db_session, repo):
        """无记录时返回空列表。"""
        result = repo.list_runs(view_id=999, page=1, page_size=20)
        assert result["total"] == 0
        assert result["items"] == []

    def test_page_size_clamped(self, app, db_session, repo):
        """page_size 超上限 200 时被截断。"""
        result = repo.list_runs(view_id=1, page=1, page_size=500)
        assert result["page_size"] == 200

    def test_page_min_clamp(self, app, db_session, repo):
        """page < 1 时被截断为 1。"""
        result = repo.list_runs(view_id=1, page=-5, page_size=20)
        assert result["page"] == 1


class TestGetRun:
    """get_run — 按 ID 查询单条记录。"""

    def test_existing_run(self, app, db_session, repo):
        """存在的 run_id 返回对象。"""
        run = repo.create_run(view_id=7)
        found = repo.get_run(run.id)
        assert found is not None
        assert found.view_id == 7

    def test_nonexistent_returns_none(self, app, db_session, repo):
        """不存在的 run_id 返回 None。"""
        assert repo.get_run(888888) is None


class TestGetViewMaterializeStatus:
    """get_view_materialize_status — 读取 semantic_views 状态。"""

    def test_returns_default_when_table_missing(self, app, db_session, repo):
        """表不存在时返回默认值（不抛异常）。"""
        result = repo.get_view_materialize_status(view_id=1)
        assert result["materialize_status"] == "idle"
        assert result["materialized_at"] is None

    def test_returns_default_when_row_missing(self, app, db_session, repo):
        """行不存在时返回默认值。"""
        from sqlalchemy import text
        db_session.execute(text(
            "CREATE TABLE IF NOT EXISTS semantic_views ("
            "  id INTEGER PRIMARY KEY,"
            "  materialize_status TEXT DEFAULT 'idle',"
            "  materialized_at DATETIME"
            ")"
        ))
        db_session.commit()
        result = repo.get_view_materialize_status(view_id=999)
        assert result["materialize_status"] == "idle"
        assert result["materialized_at"] is None

    def test_returns_actual_status(self, app, db_session, repo):
        """行存在且有状态时返回实际值。"""
        from sqlalchemy import text
        db_session.execute(text(
            "CREATE TABLE IF NOT EXISTS semantic_views ("
            "  id INTEGER PRIMARY KEY,"
            "  materialize_status TEXT DEFAULT 'idle',"
            "  materialized_at DATETIME"
            ")"
        ))
        db_session.execute(text(
            "INSERT INTO semantic_views (id, materialize_status, materialized_at) "
            "VALUES (10, 'running', '2026-04-20T12:00:00')"
        ))
        db_session.commit()
        result = repo.get_view_materialize_status(view_id=10)
        assert result["materialize_status"] == "running"
        assert result["materialized_at"] is not None


class TestSetViewMaterializeStatus:
    """set_view_materialize_status — 更新 semantic_views 状态。"""

    @pytest.fixture(autouse=True)
    def _create_semantic_views_table(self, app, db_session):
        """手动创建 semantic_views 表（测试环境未通过 ORM 建表）。"""
        from sqlalchemy import text
        db_session.execute(text(
            "CREATE TABLE IF NOT EXISTS semantic_views ("
            "  id INTEGER PRIMARY KEY,"
            "  name TEXT,"
            "  materialize_status TEXT DEFAULT 'idle',"
            "  materialized_at DATETIME"
            ")"
        ))
        db_session.execute(text(
            "INSERT INTO semantic_views (id, name) VALUES (1, 'test_view')"
        ))
        db_session.commit()

    def test_set_status_without_materialized_at(self, app, db_session, repo):
        """不带 materialized_at 时只更新 status 列。"""
        repo.set_view_materialize_status(view_id=1, status="running")
        result = repo.get_view_materialize_status(view_id=1)
        assert result["materialize_status"] == "running"

    def test_set_status_with_materialized_at(self, app, db_session, repo):
        """带 materialized_at 时同时更新两列。"""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        repo.set_view_materialize_status(
            view_id=1, status="idle", materialized_at=now,
        )
        result = repo.get_view_materialize_status(view_id=1)
        assert result["materialize_status"] == "idle"
        assert result["materialized_at"] is not None
