"""
AppDefinition / AppInstance 实体单元测试
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.domain.entities.app_definition import AppDefinition
from app.domain.entities.app_instance import AppInstance


def _make_app_definition(**overrides):
    payload = {
        "id": 1,
        "code": "report_push",
        "name": "报表推送",
        "category": "data_report",
        "description": "日报推送",
        "config_schema": {"required": ["cron"]},
        "icon": "chart",
        "author": "alice",
        "version": "1.0.0",
        "enabled": True,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
    }
    payload.update(overrides)
    return AppDefinition(**payload)


def _make_app_instance(**overrides):
    payload = {
        "id": 10,
        "app_code": "report_push",
        "name": "日报任务",
        "description": "每天推送",
        "config": {"cron": "0 8 * * *"},
        "schedule_type": "cron",
        "schedule_config": {"cron": "0 8 * * *"},
        "enabled": False,
        "owner": "alice",
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
    }
    payload.update(overrides)
    return AppInstance(**payload)


def test_app_definition_covers_stats_validation_and_to_dict(monkeypatch):
    definition = _make_app_definition()
    instances = MagicMock()
    instances.count.return_value = 3
    filtered = MagicMock()
    filtered.count.return_value = 2
    instances.filter_by.return_value = filtered
    monkeypatch.setattr(AppDefinition, "instances", property(lambda self: instances))

    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.count.return_value = 7
    monkeypatch.setattr("app.domain.entities.app_definition.db.session.query", MagicMock(return_value=query))

    assert definition.get_instance_count() == 3
    assert definition.get_active_instance_count() == 2
    assert definition.get_total_execution_count() == 7
    assert definition.validate_config({"cron": "0 8 * * *"}) == (True, [])
    assert definition.validate_config({}) == (False, ["缺少必填字段: cron"])
    assert definition.is_available() is True

    rich = definition.to_dict(include_stats=True)
    assert rich["instance_count"] == 3
    assert rich["active_instance_count"] == 2
    assert rich["total_execution_count"] == 7

    plain = definition.to_dict(include_stats=False)
    assert plain["instance_count"] is None
    assert plain["active_instance_count"] is None
    assert plain["total_execution_count"] is None
    assert repr(definition) == "<AppDefinition report_push>"


def test_app_definition_collect_events_and_empty_schema_validation():
    definition = _make_app_definition(config_schema=None, enabled=False)
    definition._domain_events = ["evt"]

    assert definition.collect_domain_events() == ["evt"]
    assert definition.collect_domain_events() == []
    assert definition.validate_config({}) == (True, [])
    assert definition.is_available() is False


def test_app_instance_covers_lifecycle_permissions_stats_and_to_dict(monkeypatch):
    instance = _make_app_instance()
    instance.app_definition = _make_app_definition()

    executions = MagicMock()
    executions.count.return_value = 4
    success_query = MagicMock()
    success_query.count.return_value = 3
    failed_query = MagicMock()
    failed_query.count.return_value = 1
    executions.filter_by.side_effect = lambda **kwargs: success_query if kwargs.get("status") == "success" else failed_query
    monkeypatch.setattr(AppInstance, "executions", property(lambda self: executions))

    avg_query = MagicMock()
    avg_query.filter.return_value = avg_query
    avg_query.scalar.return_value = 123.4
    monkeypatch.setattr("app.domain.entities.app_instance.db.session.query", MagicMock(return_value=avg_query))

    instance.enable()
    assert instance.enabled is True
    instance.disable()
    assert instance.enabled is False
    instance.update_config({"cron": "0 9 * * *"})
    assert instance.config == {"cron": "0 9 * * *"}
    instance.update_schedule("event", {"event_types": ["done"]})
    assert instance.schedule_type == "event"
    assert instance.schedule_config == {"event_types": ["done"]}

    executed_at = datetime(2026, 1, 3, tzinfo=timezone.utc)
    instance.record_execution("success", executed_at)
    assert instance.last_execution_status == "success"
    assert instance.last_execution_at == executed_at

    assert instance.get_execution_count() == 4
    assert instance.get_execution_count(status="success") == 3
    assert instance.get_success_rate() == 0.75
    assert instance.get_average_duration() == 123.4
    assert instance.can_execute() == (False, "实例已禁用")

    instance.enabled = True
    instance.app_definition.enabled = False
    assert instance.can_execute() == (False, "应用已禁用")
    instance.app_definition.enabled = True
    assert instance.can_execute() == (True, None)

    assert instance.is_owned_by("bob", roles=["admin"]) is True
    instance.owner = "system"
    assert instance.is_owned_by("bob") is True
    instance.owner = "alice"
    assert instance.is_owned_by("alice") is True
    assert instance.is_owned_by("bob") is False

    rich = instance.to_dict(include_app_info=True, include_stats=True)
    assert rich["app"]["code"] == "report_push"
    assert rich["stats"]["total_executions"] == 4
    assert rich["stats"]["success_count"] == 3
    assert rich["stats"]["failed_count"] == 1
    assert rich["stats"]["success_rate"] == 75.0
    assert rich["stats"]["avg_duration_ms"] == 123.4
    assert repr(instance) == "<AppInstance 日报任务 (report_push)>"


def test_app_instance_zero_stats_and_event_collection(monkeypatch):
    instance = _make_app_instance(enabled=True)
    instance.app_definition = _make_app_definition(enabled=True)
    executions = MagicMock()
    executions.count.return_value = 0
    filtered = MagicMock()
    filtered.count.return_value = 0
    executions.filter_by.return_value = filtered
    monkeypatch.setattr(AppInstance, "executions", property(lambda self: executions))
    instance._domain_events = ["evt"]

    assert instance.collect_domain_events() == ["evt"]
    assert instance.collect_domain_events() == []
    assert instance.get_success_rate() == 0.0


def test_app_instance_init_on_load_resets_domain_events():
    instance = _make_app_instance()
    instance._domain_events = ["stale"]

    instance.init_on_load()

    assert instance._domain_events == []
