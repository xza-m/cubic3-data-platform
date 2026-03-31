from datetime import datetime
from unittest.mock import MagicMock, Mock

import pytest

from app.application.extraction.commands.delete_task import DeleteTaskCommand
from app.application.extraction.commands.execute_task import ExecuteTaskCommand
from app.application.extraction.commands.update_task import UpdateTaskCommand
from app.application.extraction.handlers.delete_task_handler import DeleteTaskHandler
from app.application.extraction.handlers.execute_task_handler import ExecuteTaskHandler
from app.application.extraction.handlers.list_tasks_handler import ListTasksHandler
from app.application.extraction.handlers.preview_data_handler import PreviewDataHandler
from app.application.extraction.handlers.update_task_handler import UpdateTaskHandler
from app.application.extraction.queries.preview_data import PreviewDataQuery
from app.application.extraction.queries.list_tasks import ListTasksQuery
from app.shared.exceptions import DatasetNotFoundError, TaskNotFoundError


class _FakeRowsResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)


class _FakeScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class _FakeConnection:
    def __init__(self, rows, total):
        self._rows = rows
        self._total = total
        self.statements = []

    def execute(self, stmt):
        sql = str(stmt)
        self.statements.append(sql)
        if "count(" in sql.lower():
            return _FakeScalarResult(self._total)
        return _FakeRowsResult(self._rows)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeEngine:
    def __init__(self, rows, total):
        self.connection = _FakeConnection(rows, total)

    def connect(self):
        return self.connection


def _build_task_mock(task_id: int = 1):
    task = MagicMock()
    task.id = task_id
    task.dataset_id = 11
    task.task_name = "原始任务"
    task.select_fields = ["id"]
    task.filter_conditions = {}
    task.row_limit = 100
    task.schedule_config = None
    task.subscription_config = None
    task.is_active = True
    task.clear_events.return_value = ["evt"]
    return task


def test_update_task_handler_updates_fields_regenerates_sql_and_publishes_events():
    extraction_repo = Mock()
    dataset_repo = Mock()
    event_bus = Mock()
    sql_generator = Mock()
    permission_checker = Mock()
    task = _build_task_mock(task_id=7)
    dataset = MagicMock()

    extraction_repo.find_by_id.return_value = task
    extraction_repo.save.side_effect = lambda current: current
    dataset_repo.find_by_id.return_value = dataset
    sql_generator.generate_sql.return_value = "SELECT id, amount FROM orders LIMIT 10"

    handler = UpdateTaskHandler(
        extraction_repository=extraction_repo,
        dataset_repository=dataset_repo,
        event_bus=event_bus,
        sql_generator=sql_generator,
        permission_checker=permission_checker,
    )

    updated = handler.handle(
        UpdateTaskCommand(
            task_id=7,
            task_name="更新后的任务",
            select_fields=["id", "amount"],
            filter_conditions={"status": "paid"},
            row_limit=10,
            schedule_config={"cron": "0 8 * * *"},
            subscription_config={"channel": "feishu"},
            is_active=False,
            updated_by="tester",
        )
    )

    assert updated is task
    assert task.task_name == "更新后的任务"
    assert task.select_fields == ["id", "amount"]
    assert task.filter_conditions == {"status": "paid"}
    assert task.row_limit == 10
    assert task.schedule_config == {"cron": "0 8 * * *"}
    assert task.subscription_config == {"channel": "feishu"}
    assert task.is_active is False
    assert task.sql_template == "SELECT id, amount FROM orders LIMIT 10"
    permission_checker.check_field_access.assert_called_once_with(
        user_id="tester",
        dataset=dataset,
        field_names=["id", "amount"],
    )
    sql_generator.generate_sql.assert_called_once()
    task.validate_fields.assert_called_once_with()
    task.record_event.assert_called_once()
    extraction_repo.commit.assert_called_once_with()
    event_bus.publish_batch.assert_called_once_with(["evt"])


def test_update_task_handler_skips_sql_regeneration_when_only_updating_name():
    extraction_repo = Mock()
    dataset_repo = Mock()
    sql_generator = Mock()
    permission_checker = Mock()
    task = _build_task_mock(task_id=8)

    extraction_repo.find_by_id.return_value = task
    extraction_repo.save.side_effect = lambda current: current
    dataset_repo.find_by_id.return_value = MagicMock()

    handler = UpdateTaskHandler(
        extraction_repository=extraction_repo,
        dataset_repository=dataset_repo,
        sql_generator=sql_generator,
        permission_checker=permission_checker,
    )

    updated = handler.handle(UpdateTaskCommand(task_id=8, task_name="仅改名", updated_by="tester"))

    assert updated.task_name == "仅改名"
    sql_generator.generate_sql.assert_not_called()
    permission_checker.check_field_access.assert_not_called()


def test_update_task_handler_raises_when_task_is_missing():
    handler = UpdateTaskHandler(
        extraction_repository=Mock(find_by_id=Mock(return_value=None)),
        dataset_repository=Mock(),
        sql_generator=Mock(),
        permission_checker=Mock(),
    )

    with pytest.raises(TaskNotFoundError):
        handler.handle(UpdateTaskCommand(task_id=404, updated_by="tester"))


def test_execute_task_handler_saves_run_enqueues_job_and_publishes_events():
    extraction_repo = Mock()
    event_bus = Mock()
    task_queue = Mock()
    task = _build_task_mock(task_id=21)
    run = MagicMock()
    run.id = 1001

    task.execute.return_value = run
    extraction_repo.find_by_id.return_value = task
    extraction_repo.save_run.side_effect = lambda current: current
    task_queue.enqueue_extraction_task.return_value = "job-1001"

    handler = ExecuteTaskHandler(
        extraction_repository=extraction_repo,
        task_queue_manager=task_queue,
        event_bus=event_bus,
    )

    result = handler.handle(
        ExecuteTaskCommand(task_id=21, triggered_by="tester", user_id="tester", trace_id="trace-1")
    )

    assert result == {
        "run_id": 1001,
        "status": "pending",
        "message": "Task queued for execution",
        "job_id": "job-1001",
    }
    task.execute.assert_called_once_with(triggered_by="tester")
    extraction_repo.save_run.assert_called_once_with(run)
    extraction_repo.commit.assert_called_once_with()
    task.record_event.assert_called_once()
    event_bus.publish_batch.assert_called_once_with(["evt"])
    task_queue.enqueue_extraction_task.assert_called_once_with(1001)


def test_execute_task_handler_returns_none_job_id_when_queue_not_configured():
    extraction_repo = Mock()
    task = _build_task_mock(task_id=22)
    run = MagicMock()
    run.id = 2002

    task.execute.return_value = run
    extraction_repo.find_by_id.return_value = task
    extraction_repo.save_run.side_effect = lambda current: current

    handler = ExecuteTaskHandler(extraction_repository=extraction_repo, task_queue_manager=None, event_bus=None)

    result = handler.handle(ExecuteTaskCommand(task_id=22, triggered_by="tester", user_id="tester"))

    assert result["job_id"] is None
    assert result["run_id"] == 2002


def test_execute_task_handler_raises_when_task_is_missing():
    handler = ExecuteTaskHandler(extraction_repository=Mock(find_by_id=Mock(return_value=None)))

    with pytest.raises(TaskNotFoundError):
        handler.handle(ExecuteTaskCommand(task_id=999, triggered_by="tester", user_id="tester"))


def test_delete_task_handler_covers_success_failure_and_missing_paths():
    extraction_repo = Mock()
    event_bus = Mock()
    task = _build_task_mock(task_id=31)
    extraction_repo.find_by_id.return_value = task
    extraction_repo.delete.return_value = True

    handler = DeleteTaskHandler(extraction_repository=extraction_repo, event_bus=event_bus)
    success = handler.handle(DeleteTaskCommand(task_id=31, deleted_by="tester"))

    assert success is True
    extraction_repo.commit.assert_called_once_with()
    event_bus.publish_batch.assert_called_once_with(["evt"])

    extraction_repo.commit.reset_mock()
    event_bus.publish_batch.reset_mock()
    extraction_repo.delete.return_value = False
    task.clear_events.return_value = ["evt-2"]

    failed = handler.handle(DeleteTaskCommand(task_id=31, deleted_by="tester"))

    assert failed is False
    extraction_repo.commit.assert_not_called()
    event_bus.publish_batch.assert_not_called()

    missing_handler = DeleteTaskHandler(extraction_repository=Mock(find_by_id=Mock(return_value=None)))
    with pytest.raises(TaskNotFoundError):
        missing_handler.handle(DeleteTaskCommand(task_id=404, deleted_by="tester"))


def test_preview_data_handler_returns_preview_rows_and_validates_permissions(monkeypatch):
    dataset_repo = Mock()
    sql_generator = Mock()
    permission_checker = Mock()
    dataset = MagicMock()
    dataset.source.source_type = "postgresql"
    dataset.source.connection_config = {"database": "analytics"}
    dataset_repo.find_by_id.return_value = dataset
    sql_generator.generate_sql.return_value = "SELECT id FROM orders LIMIT 2"

    adapter = Mock()
    adapter.execute_query.return_value = {
        "columns": ["id"],
        "data": [{"id": 1}, {"id": 2}],
    }
    monkeypatch.setattr(
        "app.application.extraction.handlers.preview_data_handler.AdapterFactory.create_adapter",
        lambda source_type, config: adapter,
    )

    handler = PreviewDataHandler(
        dataset_repository=dataset_repo,
        sql_generator=sql_generator,
        permission_checker=permission_checker,
    )

    result = handler.handle(
        PreviewDataQuery(
            dataset_id=11,
            select_fields=["id"],
            filter_conditions={"status": "paid"},
            limit=2,
            user_id="tester",
        )
    )

    assert result == {
        "sql": "SELECT id FROM orders LIMIT 2",
        "columns": ["id"],
        "data": [{"id": 1}, {"id": 2}],
        "total": 2,
    }
    permission_checker.check_dataset_access.assert_called_once_with("tester", dataset)
    permission_checker.check_field_access.assert_called_once_with("tester", dataset, ["id"])
    adapter.execute_query.assert_called_once_with("SELECT id FROM orders LIMIT 2", limit=2)


def test_preview_data_handler_raises_when_dataset_is_missing():
    handler = PreviewDataHandler(dataset_repository=Mock(find_by_id=Mock(return_value=None)), sql_generator=Mock(), permission_checker=Mock())

    with pytest.raises(DatasetNotFoundError):
        handler.handle(PreviewDataQuery(dataset_id=404, select_fields=["id"], filter_conditions={}, user_id="tester"))


def test_list_tasks_handler_returns_paginated_items_and_supports_created_by_filter():
    rows = [
        {
            "id": 1,
            "task_name": "每日订单提取",
            "task_code": "daily_orders",
            "dataset_id": 11,
            "task_type": "manual",
            "is_active": True,
            "last_run_at": None,
            "last_run_status": "success",
            "created_at": datetime(2026, 3, 25, 10, 0, 0),
        }
    ]
    engine = _FakeEngine(rows=rows, total=21)
    handler = ListTasksHandler(db_engine=engine)

    result = handler.handle(
        ListTasksQuery(
            dataset_id=11,
            task_type="manual",
            is_active=True,
            created_by="tester",
            page=2,
            page_size=10,
        )
    )

    assert result["total"] == 21
    assert result["page"] == 2
    assert result["page_size"] == 10
    assert result["total_pages"] == 3
    assert result["items"][0].task_name == "每日订单提取"
    assert any("created_by" in statement for statement in engine.connection.statements)
