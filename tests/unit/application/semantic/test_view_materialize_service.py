# tests/unit/application/semantic/test_view_materialize_service.py
"""ViewMaterializeService 应用服务单元测试。"""
import threading
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.application.semantic.view_materialize_service import ViewMaterializeService


def _make_repo():
    repo = MagicMock()
    run = MagicMock()
    run.id = 1
    repo.create_run.return_value = run
    repo.list_runs.return_value = {"items": [], "total": 0, "page": 1, "page_size": 20}
    repo.get_view_materialize_status.return_value = {
        "materialized_at": None, "materialize_status": "idle",
    }
    return repo


class TestViewMaterializeServiceInit:
    """构造函数赋值。"""

    def test_init_stores_repo_and_service(self):
        """确认构造函数正确存储 repo 与 semantic_service。"""
        repo, svc = MagicMock(), MagicMock()
        service = ViewMaterializeService(repo=repo, semantic_service=svc)
        assert service._repo is repo
        assert service._semantic_service is svc


class TestTrigger:
    """trigger() 异步触发物化。"""

    def test_trigger_returns_run_id_and_status(self):
        """触发后立即返回 run_id + status=running。"""
        repo = _make_repo()
        svc = ViewMaterializeService(repo=repo)
        with patch.object(svc, "_run_materialize"):
            result = svc.trigger(view_id=42)
        assert result["run_id"] == 1
        assert result["status"] == "running"
        repo.set_view_materialize_status.assert_called_once_with(42, status="running")
        repo.create_run.assert_called_once_with(42)


class TestGetRuns:
    """get_runs() 分页查询。"""

    def test_delegates_to_repo(self):
        """直接委托给 repo.list_runs。"""
        repo = _make_repo()
        svc = ViewMaterializeService(repo=repo)
        svc.get_runs(view_id=10, page=2, page_size=5)
        repo.list_runs.assert_called_once_with(10, page=2, page_size=5)


class TestGetViewExtraFields:
    """get_view_extra_fields() 返回物化附加字段。"""

    def test_returns_materialize_status(self):
        """委托给 repo.get_view_materialize_status。"""
        repo = _make_repo()
        svc = ViewMaterializeService(repo=repo)
        result = svc.get_view_extra_fields(42)
        assert result["materialize_status"] == "idle"


class TestRunMaterialize:
    """_run_materialize() 后台线程逻辑。"""

    def test_success_path(self, app):
        """成功路径：finish_run(success=True) + status=idle。"""
        repo = _make_repo()
        svc = ViewMaterializeService(repo=repo, semantic_service=None)
        svc._run_materialize(view_id=1, run_id=10)
        repo.finish_run.assert_called_once_with(10, success=True)
        calls = repo.set_view_materialize_status.call_args_list
        assert any(c.kwargs.get("status") == "idle" for c in calls)

    def test_failure_path(self, app):
        """异常路径：finish_run(success=False) + status=failed。"""
        repo = _make_repo()
        sem_svc = MagicMock()
        sem_svc.materialize_view.side_effect = RuntimeError("boom")
        svc = ViewMaterializeService(repo=repo, semantic_service=sem_svc)
        svc._run_materialize(view_id=1, run_id=10)
        repo.finish_run.assert_called_once_with(10, success=False, error="boom")
        calls = repo.set_view_materialize_status.call_args_list
        assert any(c.kwargs.get("status") == "failed" for c in calls)


class TestDoMaterialize:
    """_do_materialize() 实际物化逻辑分支。"""

    def test_calls_semantic_service_materialize_view(self, app):
        """有 semantic_service.materialize_view 时调用它。"""
        sem = MagicMock()
        svc = ViewMaterializeService(repo=MagicMock(), semantic_service=sem)
        svc._do_materialize(view_id=99)
        sem.materialize_view.assert_called_once_with(99)

    def test_stub_when_no_semantic_service(self, app):
        """semantic_service 为 None 时走 stub 日志分支，不抛异常。"""
        svc = ViewMaterializeService(repo=MagicMock(), semantic_service=None)
        svc._do_materialize(view_id=99)

    def test_stub_when_no_materialize_view_attr(self, app):
        """semantic_service 无 materialize_view 属性时走 stub 分支。"""
        sem = MagicMock(spec=[])
        svc = ViewMaterializeService(repo=MagicMock(), semantic_service=sem)
        svc._do_materialize(view_id=99)
