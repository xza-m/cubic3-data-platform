# tests/unit/application/queries/test_scheduled_query_service.py
"""
单元测试：ScheduledQueryService 边缘分支覆盖

覆盖目标行（service 层）：
  - _validate_cron except 分支（30-31）
  - _compute_next_run except 分支（42-44）
  - update: sq is None → EntityNotFoundError（104）
  - update: cron in updates 重新计算 next_run_at（112-114）
  - delete: sq is None → EntityNotFoundError（125）
  - disable: sq is None → EntityNotFoundError（143）
  - trigger: next_run_at 发生变化时还原（164-165）
  - list_runs: sq is None → EntityNotFoundError（176）
  - _sync_job: except 分支（187-189）
  - _unregister_job: except 分支（195-196）
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime

from app.shared.exceptions import EntityNotFoundError, ValidationError


@pytest.mark.redesign
class TestValidateCron:
    """_validate_cron 异常分支"""

    def test_cron_five_parts_but_invalid_triggers_exception(self):
        """CronTrigger 解析失败 → ValidationError（覆盖行 30-31）"""
        from app.application.queries.scheduled_query_service import _validate_cron
        with pytest.raises(ValidationError, match="cron 解析失败"):
            _validate_cron("99 99 99 99 99")

    def test_cron_fewer_than_five_parts(self):
        """段数不足 → ValidationError"""
        from app.application.queries.scheduled_query_service import _validate_cron
        with pytest.raises(ValidationError, match="5 段格式"):
            _validate_cron("* * *")


@pytest.mark.redesign
class TestComputeNextRun:
    """_compute_next_run 异常分支"""

    def test_invalid_timezone_returns_none(self):
        """无效时区 → 返回 None（覆盖行 42-44）"""
        from app.application.queries.scheduled_query_service import _compute_next_run
        result = _compute_next_run("0 9 * * 1", "Invalid/Timezone")
        assert result is None

    def test_bad_cron_returns_none(self):
        """无效 cron 表达式 → 返回 None"""
        from app.application.queries.scheduled_query_service import _compute_next_run
        result = _compute_next_run("bad", "Asia/Shanghai")
        assert result is None


@pytest.mark.redesign
class TestServiceUpdateErrors:
    """update 方法异常路径"""

    def test_update_not_found(self):
        """更新不存在的 query → EntityNotFoundError（覆盖行 104）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        repo = MagicMock()
        repo.get.return_value = None
        svc = ScheduledQueryService(repo=repo)

        with pytest.raises(EntityNotFoundError):
            svc.update(999, {"name": "x"})

    def test_update_with_cron_recalculates_next_run(self):
        """更新 cron 字段 → 重新计算 next_run_at（覆盖行 112-114）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        repo = MagicMock()
        sq = MagicMock()
        sq.id = 1
        sq.enabled = True
        sq.timezone = "Asia/Shanghai"
        sq.to_dict.return_value = {"id": 1}
        repo.get.return_value = sq
        repo.update.return_value = sq
        svc = ScheduledQueryService(repo=repo)

        with patch("app.application.queries.scheduled_query_service._compute_next_run", return_value=None):
            with patch.object(svc, "_sync_job"):
                result = svc.update(1, {"cron": "0 8 * * *"})

        call_args = repo.update.call_args[0]
        assert "next_run_at" in call_args[1]


@pytest.mark.redesign
class TestServiceDeleteErrors:
    """delete 方法异常路径"""

    def test_delete_not_found(self):
        """删除不存在的 query → EntityNotFoundError（覆盖行 125）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        repo = MagicMock()
        repo.get.return_value = None
        svc = ScheduledQueryService(repo=repo)

        with pytest.raises(EntityNotFoundError):
            svc.delete(999)


@pytest.mark.redesign
class TestServiceDisableErrors:
    """disable 方法异常路径"""

    def test_disable_not_found(self):
        """禁用不存在的 query → EntityNotFoundError（覆盖行 143）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        repo = MagicMock()
        repo.get.return_value = None
        svc = ScheduledQueryService(repo=repo)

        with pytest.raises(EntityNotFoundError):
            svc.disable(999)


@pytest.mark.redesign
class TestServiceListRunsErrors:
    """list_runs 方法异常路径"""

    def test_list_runs_not_found(self):
        """查看不存在 query 的 runs → EntityNotFoundError（覆盖行 176）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        repo = MagicMock()
        repo.get.return_value = None
        svc = ScheduledQueryService(repo=repo)

        with pytest.raises(EntityNotFoundError):
            svc.list_runs(999)


@pytest.mark.redesign
class TestServiceTriggerNextRunRestore:
    """trigger 方法：next_run_at 被改变后还原"""

    def test_trigger_restores_next_run_at_when_changed(self):
        """trigger 执行后 next_run_at 变了 → 还原（覆盖行 164-165）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        repo = MagicMock()

        original_time = datetime(2026, 1, 1, 9, 0, 0)
        changed_time = datetime(2026, 1, 2, 9, 0, 0)

        sq_before = MagicMock()
        sq_before.next_run_at = original_time

        sq_after = MagicMock()
        sq_after.next_run_at = changed_time

        sq_restored = MagicMock()
        sq_restored.next_run_at = original_time

        repo.get.side_effect = [sq_before, sq_after, sq_restored]
        repo.list_runs.return_value = {"items": [{"id": 1}], "total": 1}

        svc = ScheduledQueryService(repo=repo)

        with patch(
            "app.infrastructure.queries.scheduled_query_runner._run_in_context"
        ):
            result = svc.trigger(1)

        repo.update.assert_called_once_with(1, {"next_run_at": original_time})


@pytest.mark.redesign
class TestServiceSyncJobErrors:
    """_sync_job / _unregister_job 异常吞没"""

    def test_sync_job_enable_swallows_exception(self):
        """_sync_job(enable=True) 异常被吞没（覆盖行 187-189）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        svc = ScheduledQueryService(repo=MagicMock())
        sq = MagicMock()
        sq.id = 1

        with patch(
            "app.infrastructure.queries.scheduled_query_runner.register_job",
            side_effect=RuntimeError("scheduler dead"),
        ):
            svc._sync_job(sq, enable=True)

    def test_sync_job_disable_swallows_exception(self):
        """_sync_job(enable=False) 异常被吞没"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        svc = ScheduledQueryService(repo=MagicMock())
        sq = MagicMock()
        sq.id = 1

        with patch(
            "app.infrastructure.queries.scheduled_query_runner.unregister_job",
            side_effect=RuntimeError("nope"),
        ):
            svc._sync_job(sq, enable=False)

    def test_unregister_job_swallows_exception(self):
        """_unregister_job 异常被吞没（覆盖行 195-196）"""
        from app.application.queries.scheduled_query_service import ScheduledQueryService
        svc = ScheduledQueryService(repo=MagicMock())

        with patch(
            "app.infrastructure.queries.scheduled_query_runner.unregister_job",
            side_effect=RuntimeError("gone"),
        ):
            svc._unregister_job(42)
