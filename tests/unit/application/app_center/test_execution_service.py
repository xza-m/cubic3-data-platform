"""
Unit tests for ExecutionService state machine.

Covers:
- execute_instance: pending record creation + enqueue
- _execute_sync: success / failure state transitions
- _publish_domain_events: event bus delegation
"""
from datetime import datetime

import pytest
from unittest.mock import MagicMock, patch, call

from app.application.services.app_center.execution_service import ExecutionService
from app.shared.exceptions import NotFoundError


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_execution_repo():
    repo = MagicMock()
    return repo


@pytest.fixture
def mock_instance_repo():
    repo = MagicMock()
    return repo


@pytest.fixture
def mock_event_bus():
    return MagicMock()


@pytest.fixture
def service(mock_execution_repo, mock_instance_repo, mock_event_bus):
    return ExecutionService(
        app_execution_repository=mock_execution_repo,
        app_instance_repository=mock_instance_repo,
        event_bus=mock_event_bus,
    )


def _make_instance(instance_id=1, app_code="test_app", can_execute=True, reason=""):
    inst = MagicMock()
    inst.id = instance_id
    inst.app_code = app_code
    inst.config = {"key": "value"}
    inst.can_execute.return_value = (can_execute, reason)
    return inst


def _make_execution(execution_id=10, trigger_type="manual"):
    ex = MagicMock()
    ex.id = execution_id
    ex.trigger_type = trigger_type
    ex.collect_domain_events.return_value = []
    return ex


# ============================================================================
# execute_instance
# ============================================================================

class TestExecuteInstance:
    def test_raises_not_found_when_instance_missing(self, service, mock_instance_repo):
        mock_instance_repo.find_by_id.return_value = None
        with pytest.raises(NotFoundError):
            service.execute_instance(instance_id=99)

    def test_raises_when_instance_cannot_execute(self, service, mock_instance_repo):
        inst = _make_instance(can_execute=False, reason="disabled")
        mock_instance_repo.find_by_id.return_value = inst
        with pytest.raises(Exception, match="无法执行"):
            service.execute_instance(instance_id=1)

    def test_creates_pending_execution_and_enqueues(
        self, service, mock_instance_repo, mock_execution_repo
    ):
        inst = _make_instance(instance_id=5)
        mock_instance_repo.find_by_id.return_value = inst

        saved_execution = _make_execution(execution_id=42)
        mock_execution_repo.save.return_value = saved_execution

        mock_queue = MagicMock()
        mock_exec_cls = MagicMock(return_value=MagicMock())
        with patch("app.application.services.app_center.execution_service.AppExecution",
                   mock_exec_cls):
            with patch("app.infrastructure.queue.get_queue", return_value=mock_queue):
                result = service.execute_instance(
                    instance_id=5, trigger_type="manual", triggered_by="user1"
                )

        assert result == 42
        mock_execution_repo.save.assert_called_once()
        mock_queue.enqueue.assert_called_once()

        enqueue_kwargs = mock_queue.enqueue.call_args
        assert enqueue_kwargs[1]["execution_id"] == 42
        assert enqueue_kwargs[1]["instance_id"] == 5

    def test_returns_execution_id(
        self, service, mock_instance_repo, mock_execution_repo
    ):
        inst = _make_instance()
        mock_instance_repo.find_by_id.return_value = inst
        saved = _make_execution(execution_id=77)
        mock_execution_repo.save.return_value = saved

        mock_exec_cls = MagicMock(return_value=MagicMock())
        with patch("app.application.services.app_center.execution_service.AppExecution",
                   mock_exec_cls):
            with patch("app.infrastructure.queue.get_queue"):
                result = service.execute_instance(instance_id=1)

        assert result == 77


# ============================================================================
# _execute_sync (called by RQ Worker)
# ============================================================================

class TestExecuteSync:
    def _setup(
        self,
        service,
        mock_execution_repo,
        mock_instance_repo,
        execution_id=10,
        instance_id=1,
    ):
        instance = _make_instance(instance_id=instance_id)
        execution = _make_execution(execution_id=execution_id)
        mock_execution_repo.find_by_id.return_value = execution
        mock_instance_repo.find_by_id.return_value = instance
        return instance, execution

    def test_marks_execution_started(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        instance, execution = self._setup(service, mock_execution_repo, mock_instance_repo)
        mock_executor = MagicMock()
        mock_result = MagicMock()
        mock_result.is_success.return_value = True
        mock_result.output = {"done": True}
        mock_executor.execute.return_value = mock_result

        with patch(
            "app.application.services.app_center.execution_service.ExecutorFactory.create",
            return_value=mock_executor,
        ):
            service._execute_sync(10, 1, "system", {})

        execution.start.assert_called_once()

    def test_success_path_completes_with_output(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        instance, execution = self._setup(service, mock_execution_repo, mock_instance_repo)
        mock_result = MagicMock()
        mock_result.is_success.return_value = True
        mock_result.output = {"rows_processed": 100}

        mock_executor = MagicMock()
        mock_executor.execute.return_value = mock_result

        with patch(
            "app.application.services.app_center.execution_service.ExecutorFactory.create",
            return_value=mock_executor,
        ):
            service._execute_sync(10, 1, "system", {})

        execution.complete_success.assert_called_once_with(output={"rows_processed": 100})
        execution.complete_failure.assert_not_called()

    def test_failure_path_completes_with_error(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        instance, execution = self._setup(service, mock_execution_repo, mock_instance_repo)
        mock_result = MagicMock()
        mock_result.is_success.return_value = False
        mock_result.error_message = "something went wrong"

        mock_executor = MagicMock()
        mock_executor.execute.return_value = mock_result

        with patch(
            "app.application.services.app_center.execution_service.ExecutorFactory.create",
            return_value=mock_executor,
        ):
            service._execute_sync(10, 1, "system", {})

        execution.complete_failure.assert_called_once_with(error_message="something went wrong")
        execution.complete_success.assert_not_called()

    def test_exception_during_execution_marks_failure(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        instance, execution = self._setup(service, mock_execution_repo, mock_instance_repo)

        mock_executor = MagicMock()
        mock_executor.execute.side_effect = RuntimeError("unexpected error")

        with patch(
            "app.application.services.app_center.execution_service.ExecutorFactory.create",
            return_value=mock_executor,
        ):
            service._execute_sync(10, 1, "system", {})

        execution.complete_failure.assert_called_once()
        call_args = execution.complete_failure.call_args[1]
        assert "unexpected error" in call_args["error_message"]

    def test_missing_executor_marks_failure(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        instance, execution = self._setup(service, mock_execution_repo, mock_instance_repo)

        with patch(
            "app.application.services.app_center.execution_service.ExecutorFactory.create",
            return_value=None,
        ):
            service._execute_sync(10, 1, "system", {})

        execution.complete_failure.assert_called_once()

    def test_returns_early_if_execution_not_found(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        mock_execution_repo.find_by_id.return_value = None
        service._execute_sync(99, 1, "system", {})
        mock_instance_repo.find_by_id.assert_not_called()

    def test_returns_early_if_instance_not_found(
        self, service, mock_execution_repo, mock_instance_repo
    ):
        execution = _make_execution()
        mock_execution_repo.find_by_id.return_value = execution
        mock_instance_repo.find_by_id.return_value = None
        service._execute_sync(10, 99, "system", {})
        execution.start.assert_not_called()


# ============================================================================
# _publish_domain_events
# ============================================================================

class TestPublishDomainEvents:
    def test_publishes_collected_events(self, service, mock_event_bus):
        entity = MagicMock()
        event1, event2 = MagicMock(), MagicMock()
        entity.collect_domain_events.return_value = [event1, event2]

        service._publish_domain_events(entity)

        assert mock_event_bus.publish.call_count == 2
        mock_event_bus.publish.assert_any_call(event1)
        mock_event_bus.publish.assert_any_call(event2)

    def test_no_publish_when_event_bus_is_none(self):
        svc = ExecutionService(
            app_execution_repository=MagicMock(),
            app_instance_repository=MagicMock(),
            event_bus=None,
        )
        entity = MagicMock()
        entity.collect_domain_events.return_value = [MagicMock()]
        svc._publish_domain_events(entity)
        entity.collect_domain_events.assert_not_called()

    def test_continues_on_event_publish_failure(self, service, mock_event_bus):
        """A failing event publish should not raise, just log."""
        mock_event_bus.publish.side_effect = Exception("bus error")
        entity = MagicMock()
        entity.collect_domain_events.return_value = [MagicMock()]

        service._publish_domain_events(entity)


# ============================================================================
# query helpers and queue wrappers
# ============================================================================

class TestQueryHelpers:
    def test_get_execution_returns_none_when_missing(self, service, mock_execution_repo):
        mock_execution_repo.find_by_id.return_value = None

        assert service.get_execution(404) is None

    def test_get_execution_returns_serialized_payload_when_found(self, service, mock_execution_repo):
        execution = MagicMock()
        execution.to_dict.return_value = {"id": 7, "status": "success"}
        mock_execution_repo.find_by_id.return_value = execution

        result = service.get_execution(7)

        assert result == {"id": 7, "status": "success"}
        execution.to_dict.assert_called_once_with(include_instance_info=True)

    def test_list_executions_returns_paginated_payload(self, service, mock_execution_repo):
        execution_a = MagicMock()
        execution_b = MagicMock()
        execution_a.to_dict.return_value = {"id": 1}
        execution_b.to_dict.return_value = {"id": 2}
        mock_execution_repo.find_all.return_value = ([execution_a, execution_b], 21)

        result = service.list_executions(
            instance_id=9,
            status="success",
            trigger_type="manual",
            start_date="start",
            end_date="end",
            page=2,
            page_size=10,
        )

        assert result == {
            "items": [{"id": 1}, {"id": 2}],
            "total": 21,
            "page": 2,
            "page_size": 10,
            "pages": 3,
        }
        mock_execution_repo.find_all.assert_called_once_with(
            app_code=None,
            instance_id=9,
            status="success",
            trigger_type="manual",
            start_date="start",
            end_date="end",
            page=2,
            page_size=10,
        )

    def test_get_execution_stats_computes_success_rate_and_rounding(self, service, mock_execution_repo):
        mock_execution_repo.get_stats.return_value = {
            "total_executions": 3,
            "success_count": 2,
            "failed_count": 1,
            "avg_duration_ms": 123.456,
        }

        result = service.get_execution_stats(instance_id=5, days=14)

        assert result == {
            "total_executions": 3,
            "success_count": 2,
            "failed_count": 1,
            "success_rate": 66.67,
            "avg_duration_ms": 123.46,
            "period_days": 14,
        }
        call_args = mock_execution_repo.get_stats.call_args.kwargs
        assert call_args["instance_id"] == 5
        assert isinstance(call_args["start_date"], datetime)

    def test_get_execution_stats_handles_zero_total(self, service, mock_execution_repo):
        mock_execution_repo.get_stats.return_value = {
            "total_executions": 0,
            "success_count": 0,
            "failed_count": 0,
            "avg_duration_ms": 0.0,
        }

        result = service.get_execution_stats(days=1)

        assert result["success_rate"] == 0
        assert result["avg_duration_ms"] == 0.0
        assert result["period_days"] == 1


class TestQueueWrappers:
    def test_enqueue_instance_execution_uses_container_service(self, monkeypatch):
        execution_service = MagicMock()
        execution_service.execute_instance.return_value = 88
        container = MagicMock()
        container.execution_service.return_value = execution_service
        monkeypatch.setattr(
            "app.application.services.app_center.execution_service.get_container",
            MagicMock(return_value=container),
            raising=False,
        )
        monkeypatch.setattr(
            "app.di.container.get_container",
            MagicMock(return_value=container),
        )

        from app.application.services.app_center.execution_service import enqueue_instance_execution

        result = enqueue_instance_execution(
            instance_id=11,
            trigger_type="event",
            triggered_by="tester",
            extra_data={"source": "hook"},
        )

        assert result == 88
        execution_service.execute_instance.assert_called_once_with(
            instance_id=11,
            trigger_type="event",
            triggered_by="tester",
            extra_data={"source": "hook"},
        )

    def test_execute_app_instance_async_dispatches_sync_or_fallback_create(self, monkeypatch):
        service = MagicMock()
        container = MagicMock()
        container.execution_service.return_value = service
        monkeypatch.setattr(
            "app.di.container.get_container",
            MagicMock(return_value=container),
        )

        from app.application.services.app_center.execution_service import execute_app_instance_async

        execute_app_instance_async(
            execution_id=21,
            instance_id=9,
            triggered_by="tester",
            extra_data={"source": "event"},
        )
        service._execute_sync.assert_called_once_with(21, 9, "tester", {"source": "event"})

        service._execute_sync.reset_mock()
        service.execute_instance.return_value = 77

        result = execute_app_instance_async(
            execution_id=None,
            instance_id=9,
            triggered_by="tester",
            extra_data={"source": "event"},
        )

        assert result == 77
        service._execute_sync.assert_not_called()
        service.execute_instance.assert_called_once_with(
            instance_id=9,
            trigger_type="event",
            triggered_by="tester",
            extra_data={"source": "event"},
        )
