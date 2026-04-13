"""
应用定义与调度服务测试
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.application.services.app_center.app_definition_service import AppDefinitionService
from app.application.services.app_center.scheduler_service import SchedulerService


@pytest.fixture(autouse=True)
def _reset_scheduler_singleton():
    SchedulerService._scheduler = None
    yield
    SchedulerService._scheduler = None


def test_app_definition_service_get_all_and_get_by_code():
    repo = MagicMock()
    app = MagicMock()
    app.to_dict.side_effect = [
        {"code": "report_push", "instance_count": None},
        {"code": "report_push", "instance_count": 3},
    ]
    repo.find_all.return_value = [app]
    repo.find_by_code.side_effect = [app, None]
    service = AppDefinitionService(repo)

    assert service.get_all_apps(category="report", enabled_only=False, include_stats=False) == [
        {"code": "report_push", "instance_count": None}
    ]
    assert service.get_app_by_code("report_push") == {"code": "report_push", "instance_count": 3}
    assert service.get_app_by_code("missing") is None


def test_app_definition_service_get_by_code_returns_none_when_missing():
    repo = MagicMock()
    repo.find_by_code.return_value = None
    service = AppDefinitionService(repo)

    assert service.get_app_by_code("missing") is None


def test_app_definition_service_get_config_schema_prefers_db_then_executor(monkeypatch):
    repo = MagicMock()
    app = MagicMock(config_schema={"type": "object"})
    repo.find_by_code.side_effect = [app, MagicMock(config_schema=None), MagicMock(config_schema=None), None]
    executor = MagicMock()
    executor.get_config_schema.return_value = {"type": "array"}
    monkeypatch.setattr(
        "app.application.services.app_center.app_definition_service.ExecutorFactory.create",
        MagicMock(side_effect=[executor, None]),
    )
    service = AppDefinitionService(repo)

    assert service.get_config_schema("from_db") == {"type": "object"}
    assert service.get_config_schema("from_executor") == {"type": "array"}
    assert service.get_config_schema("no_executor") is None
    assert service.get_config_schema("missing") is None


def test_app_definition_service_get_categories_formats_display_name():
    repo = MagicMock()
    repo.get_categories_with_count.return_value = [
        SimpleNamespace(category="data_report", app_count=2),
        SimpleNamespace(category="system_maintenance", app_count=1),
        SimpleNamespace(category="agent", app_count=1),
        SimpleNamespace(category="custom", app_count=1),
    ]
    service = AppDefinitionService(repo)

    assert service.get_categories() == [
        {"category": "data_report", "app_count": 2, "display_name": "数据报告"},
        {"category": "system_maintenance", "app_count": 1, "display_name": "系统维护"},
        {"category": "agent", "app_count": 1, "display_name": "Agent"},
        {"category": "custom", "app_count": 1, "display_name": "custom"},
    ]


def test_app_definition_service_validate_config_covers_error_paths(monkeypatch):
    repo = MagicMock()
    service = AppDefinitionService(repo)

    repo.find_by_code.return_value = None
    assert service.validate_app_config("missing", {}) == (False, ["应用 missing 不存在"])

    disabled_app = MagicMock(enabled=False)
    repo.find_by_code.return_value = disabled_app
    assert service.validate_app_config("disabled", {}) == (False, ["应用 disabled 已禁用"])

    enabled_app = MagicMock(enabled=True)
    repo.find_by_code.return_value = enabled_app
    monkeypatch.setattr(
        "app.application.services.app_center.app_definition_service.ExecutorFactory.create",
        MagicMock(return_value=None),
    )
    assert service.validate_app_config("no-executor", {}) == (
        False,
        ["未找到应用 no-executor 的执行器"],
    )


def test_app_definition_service_validate_config_flattens_validation_errors(monkeypatch):
    repo = MagicMock()
    repo.find_by_code.return_value = MagicMock(enabled=True)
    executor = MagicMock()
    executor.validate_config.return_value = SimpleNamespace(
        is_valid=False,
        errors={"cron": ["不能为空"], "channel": ["不支持"]},
    )
    monkeypatch.setattr(
        "app.application.services.app_center.app_definition_service.ExecutorFactory.create",
        MagicMock(return_value=executor),
    )
    service = AppDefinitionService(repo)

    assert service.validate_app_config("report_push", {"a": 1}) == (
        False,
        ["cron: 不能为空", "channel: 不支持"],
    )


def test_app_definition_service_validate_config_success(monkeypatch):
    repo = MagicMock()
    repo.find_by_code.return_value = MagicMock(enabled=True)
    executor = MagicMock()
    executor.validate_config.return_value = SimpleNamespace(is_valid=True, errors={})
    monkeypatch.setattr(
        "app.application.services.app_center.app_definition_service.ExecutorFactory.create",
        MagicMock(return_value=executor),
    )
    service = AppDefinitionService(repo)

    assert service.validate_app_config("report_push", {"cron": "0 * * * *"}) == (True, [])


def test_scheduler_service_get_scheduler_is_singleton(monkeypatch):
    scheduler = MagicMock()
    background = MagicMock(return_value=scheduler)
    monkeypatch.setattr(
        "app.application.services.app_center.scheduler_service.BackgroundScheduler",
        background,
    )

    first = SchedulerService.get_scheduler()
    second = SchedulerService.get_scheduler()

    assert first is scheduler
    assert second is scheduler
    background.assert_called_once()
    scheduler.start.assert_called_once()


def test_scheduler_service_add_schedule_skips_invalid_inputs(monkeypatch):
    service = SchedulerService()
    logger = MagicMock()
    monkeypatch.setattr("app.application.services.app_center.scheduler_service.logger", logger)
    scheduler = MagicMock()
    monkeypatch.setattr(service, "get_scheduler", MagicMock(return_value=scheduler))

    service.add_schedule(SimpleNamespace(id=1, name="manual", schedule_type="manual", schedule_config={}))
    service.add_schedule(SimpleNamespace(id=2, name="broken", schedule_type="cron", schedule_config={}))
    service.add_schedule(
        SimpleNamespace(id=3, name="broken", schedule_type="cron", schedule_config={"cron": "* * *"})
    )

    scheduler.add_job.assert_not_called()
    logger.warning.assert_called_once()
    logger.error.assert_called_once()


def test_scheduler_service_add_remove_reload_and_list_jobs(monkeypatch):
    logger = MagicMock()
    monkeypatch.setattr("app.application.services.app_center.scheduler_service.logger", logger)
    scheduler = MagicMock()
    scheduler.get_job.side_effect = [object(), object(), None]
    monkeypatch.setattr(
        "app.application.services.app_center.scheduler_service.SchedulerService.get_scheduler",
        MagicMock(return_value=scheduler),
    )

    service = SchedulerService(app_instance_repository=MagicMock())
    instance = SimpleNamespace(
        id=10,
        name="日报推送",
        schedule_type="cron",
        schedule_config={"cron": "0 8 * * 1-5"},
    )
    service.add_schedule(instance)
    service.remove_schedule(10)

    first_job = SimpleNamespace(
        id="job-1",
        name="日报推送",
        next_run_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        trigger="cron[0 8 * * 1-5]",
    )
    scheduler.get_jobs.return_value = [first_job]
    assert service.get_all_jobs() == [
        {
            "id": "job-1",
            "name": "日报推送",
            "next_run_time": "2026-01-01T00:00:00+00:00",
            "trigger": "cron[0 8 * * 1-5]",
        }
    ]
    scheduler.remove_job.assert_called()
    scheduler.add_job.assert_called_once()


def test_scheduler_service_reload_all_schedules_handles_missing_repo_and_add_errors(monkeypatch):
    logger = MagicMock()
    monkeypatch.setattr("app.application.services.app_center.scheduler_service.logger", logger)
    scheduler = MagicMock()
    monkeypatch.setattr(
        "app.application.services.app_center.scheduler_service.SchedulerService.get_scheduler",
        MagicMock(return_value=scheduler),
    )

    SchedulerService().reload_all_schedules()
    logger.error.assert_called_once()

    repo = MagicMock()
    repo.find_enabled_cron_instances.return_value = [
        SimpleNamespace(id=1, name="ok"),
        SimpleNamespace(id=2, name="bad"),
    ]
    service = SchedulerService(app_instance_repository=repo)
    service.add_schedule = MagicMock(side_effect=[None, RuntimeError("boom")])
    service.reload_all_schedules()

    scheduler.remove_all_jobs.assert_called()
    assert service.add_schedule.call_count == 2
    assert logger.error.call_count >= 2
    logger.info.assert_called()


def test_scheduler_execute_instance_job_covers_success_and_exception(monkeypatch):
    logger = MagicMock()
    monkeypatch.setattr("app.application.services.app_center.scheduler_service.logger", logger)
    execution_service = MagicMock()
    execution_service.execute_instance.return_value = 99
    container = MagicMock()
    container.execution_service.return_value = execution_service
    monkeypatch.setattr("app.di.container.get_container", MagicMock(return_value=container))

    SchedulerService._execute_instance_job(7)
    execution_service.execute_instance.assert_called_once_with(
        instance_id=7,
        trigger_type="scheduled",
        triggered_by="system",
    )

    execution_service.execute_instance.side_effect = RuntimeError("boom")
    SchedulerService._execute_instance_job(8)
    assert logger.error.called
