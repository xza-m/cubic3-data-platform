# tests/unit/infrastructure/queries/test_scheduled_query_runner.py
"""
单元测试：scheduled_query_runner 各执行路径覆盖

覆盖目标行（runner 层）：
  - _compute_next_run except 分支（39-41）
  - execute_scheduled_query（54-57）
  - _run_in_context: sq not found / disabled（68-69）
  - _run_in_context: success + failure 记录
  - _execute_sql（106-109）
  - register_job except 分支（136-137）
  - unregister_job except 分支（148-149）
  - reload_all_scheduled_queries（158-167）
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime


@pytest.mark.redesign
class TestRunnerComputeNextRun:
    """_compute_next_run 异常分支"""

    def test_invalid_tz_returns_none(self):
        """无效时区 → None（覆盖行 39-41）"""
        from app.infrastructure.queries.scheduled_query_runner import _compute_next_run
        assert _compute_next_run("0 9 * * 1", "Bogus/Zone") is None

    def test_invalid_cron_returns_none(self):
        """无效 cron → None"""
        from app.infrastructure.queries.scheduled_query_runner import _compute_next_run
        assert _compute_next_run("not valid", "Asia/Shanghai") is None


@pytest.mark.redesign
class TestExecuteScheduledQuery:
    """execute_scheduled_query 在 app context 中调用 _run_in_context"""

    def test_execute_delegates_to_run_in_context(self, app):
        """覆盖行 54-57：在 Flask app context 下调用"""
        from app.infrastructure.queries.scheduled_query_runner import execute_scheduled_query

        with patch(
            "app.infrastructure.queries.scheduled_query_runner._run_in_context"
        ) as mock_run:
            with app.app_context():
                execute_scheduled_query(42)
            mock_run.assert_called_once_with(42)


@pytest.mark.redesign
class TestRunInContextSkip:
    """_run_in_context: query 不存在或已禁用"""

    def test_skip_when_query_not_found(self, app):
        """query 不存在 → skip（覆盖行 68-69）"""
        from app.infrastructure.queries.scheduled_query_runner import _run_in_context

        with patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.get",
            return_value=None,
        ):
            _run_in_context(999)

    def test_skip_when_query_disabled(self, app):
        """query 已禁用 → skip"""
        from app.infrastructure.queries.scheduled_query_runner import _run_in_context

        sq = MagicMock()
        sq.enabled = False

        with patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.get",
            return_value=sq,
        ):
            _run_in_context(999)


@pytest.mark.redesign
class TestRunInContextSuccess:
    """_run_in_context: 成功执行路径"""

    def test_success_path_records_run(self, app):
        """SQL 执行成功 → run status=success + 更新 last_run + next_run"""
        from app.infrastructure.queries.scheduled_query_runner import _run_in_context

        sq = MagicMock()
        sq.id = 1
        sq.enabled = True
        sq.cron = "0 9 * * 1"
        sq.timezone = "Asia/Shanghai"

        run = MagicMock()
        run.id = 10
        run.started_at = datetime(2026, 1, 1)

        sq2 = MagicMock()

        with patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.get",
            side_effect=[sq, sq2],
        ), patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.create_run",
            return_value=run,
        ), patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.finish_run",
        ) as mock_finish, patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.update_query_last_run",
        ), patch(
            "app.infrastructure.queries.scheduled_query_runner._execute_sql",
            return_value=42,
        ), patch(
            "app.infrastructure.queries.scheduled_query_runner._compute_next_run",
            return_value=datetime(2026, 2, 1, 9, 0),
        ):
            _run_in_context(1)

            mock_finish.assert_called_once()
            args = mock_finish.call_args
            assert args[1]["status"] == "success"
            assert args[1]["rows_returned"] == 42


@pytest.mark.redesign
class TestRunInContextFailure:
    """_run_in_context: SQL 执行失败"""

    def test_failure_path_records_error(self, app):
        """SQL 执行抛异常 → run status=failed + error 记录"""
        from app.infrastructure.queries.scheduled_query_runner import _run_in_context

        sq = MagicMock()
        sq.id = 1
        sq.enabled = True
        sq.cron = "0 9 * * 1"
        sq.timezone = "Asia/Shanghai"

        run = MagicMock()
        run.id = 10
        run.started_at = datetime(2026, 1, 1)

        with patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.get",
            return_value=sq,
        ), patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.create_run",
            return_value=run,
        ), patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.finish_run",
        ) as mock_finish, patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.update_query_last_run",
        ), patch(
            "app.infrastructure.queries.scheduled_query_runner._execute_sql",
            side_effect=RuntimeError("query timeout"),
        ), patch(
            "app.infrastructure.queries.scheduled_query_runner._compute_next_run",
            return_value=None,
        ):
            _run_in_context(1)

            args = mock_finish.call_args
            assert args[1]["status"] == "failed"
            assert "query timeout" in args[1]["error"]


@pytest.mark.redesign
class TestExecuteSQL:
    """_execute_sql 内部路径"""

    def test_execute_sql_datasource_not_found(self, app):
        """数据源不存在 → ValueError（覆盖行 106-109）"""
        from app.infrastructure.queries.scheduled_query_runner import _execute_sql

        sq = MagicMock()
        sq.datasource_id = 999

        mock_container = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_by_id.return_value = None
        mock_container.datasource_repository.return_value = mock_repo

        with patch(
            "app.di.container.get_container",
            return_value=mock_container,
        ):
            with pytest.raises(ValueError, match="not found"):
                _execute_sql(sq)

    def test_execute_sql_success(self, app):
        """数据源存在 → 返回 None（占位成功）"""
        from app.infrastructure.queries.scheduled_query_runner import _execute_sql

        sq = MagicMock()
        sq.datasource_id = 1

        mock_container = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_by_id.return_value = MagicMock()
        mock_container.datasource_repository.return_value = mock_repo

        with patch(
            "app.di.container.get_container",
            return_value=mock_container,
        ):
            result = _execute_sql(sq)
            assert result is None


@pytest.mark.redesign
class TestRegisterJob:
    """register_job 异常分支"""

    def test_register_job_scheduler_error(self):
        """scheduler.add_job 失败 → 日志但不抛出（覆盖行 136-137）"""
        from app.infrastructure.queries.scheduled_query_runner import register_job

        sq = MagicMock()
        sq.id = 1
        sq.cron = "0 9 * * 1"
        sq.timezone = "Asia/Shanghai"

        with patch("app.extensions.scheduler") as mock_sched:
            mock_sched.add_job.side_effect = RuntimeError("scheduler not started")
            register_job(sq)

    def test_register_job_success(self):
        """正常注册 → add_job 被调用"""
        from app.infrastructure.queries.scheduled_query_runner import register_job

        sq = MagicMock()
        sq.id = 1
        sq.cron = "0 9 * * 1"
        sq.timezone = "Asia/Shanghai"

        with patch("app.extensions.scheduler") as mock_sched:
            register_job(sq)
            mock_sched.add_job.assert_called_once()


@pytest.mark.redesign
class TestUnregisterJob:
    """unregister_job 异常分支"""

    def test_unregister_job_not_found(self):
        """remove_job 不存在 → 静默忽略（覆盖行 148-149）"""
        from app.infrastructure.queries.scheduled_query_runner import unregister_job

        with patch("app.extensions.scheduler") as mock_sched:
            mock_sched.remove_job.side_effect = KeyError("no such job")
            unregister_job(42)

    def test_unregister_job_success(self):
        """正常移除 → remove_job 被调用"""
        from app.infrastructure.queries.scheduled_query_runner import unregister_job

        with patch("app.extensions.scheduler") as mock_sched:
            unregister_job(42)
            mock_sched.remove_job.assert_called_once()


@pytest.mark.redesign
class TestReloadAllScheduledQueries:
    """reload_all_scheduled_queries 路径"""

    def test_reload_success(self):
        """从数据库加载 enabled queries 并注册（覆盖行 158-167）"""
        from app.infrastructure.queries.scheduled_query_runner import reload_all_scheduled_queries

        sq1 = MagicMock()
        sq1.id = 1
        sq2 = MagicMock()
        sq2.id = 2

        with patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.list_enabled",
            return_value=[sq1, sq2],
        ), patch(
            "app.infrastructure.queries.scheduled_query_runner.register_job"
        ) as mock_reg:
            reload_all_scheduled_queries()
            assert mock_reg.call_count == 2

    def test_reload_exception_swallowed(self):
        """list_enabled 失败 → 异常被吞没（覆盖行 166-167）"""
        from app.infrastructure.queries.scheduled_query_runner import reload_all_scheduled_queries

        with patch(
            "app.infrastructure.queries.scheduled_query_repo.ScheduledQueryRepo.list_enabled",
            side_effect=RuntimeError("db down"),
        ):
            reload_all_scheduled_queries()
