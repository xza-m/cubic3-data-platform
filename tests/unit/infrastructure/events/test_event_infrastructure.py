import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from app.domain.events.app_events import AppExecutionCompleted
from app.domain.events.datasource_events import DatasourceCreated
from app.infrastructure.events.dispatcher import dispatch_event
from app.infrastructure.events.event_bus import EventBus
from app.infrastructure.events.handlers.dataset_handler import (
    on_dataset_created,
    on_dataset_deleted,
    on_dataset_updated,
)
from app.infrastructure.events.handlers.datasource_handler import (
    on_datasource_created,
    on_datasource_deleted,
    on_datasource_updated,
)
from app.infrastructure.events.handlers.extraction_handler import (
    on_task_created,
    on_task_executed,
    on_task_execution_completed,
    on_task_execution_failed,
)
from app.infrastructure.events.registry import register_event_handlers


class TestDispatcher:
    def test_dispatch_event_imports_handler_and_executes_it(self):
        fake_module = ModuleType('fake_events')
        fake_handler = MagicMock()
        fake_module.handle = fake_handler

        with patch('app.infrastructure.events.dispatcher.importlib.import_module', return_value=fake_module):
            dispatch_event({'event_type': 'demo', 'event_id': 'evt-1'}, 'fake_events.handle')

        fake_handler.assert_called_once_with({'event_type': 'demo', 'event_id': 'evt-1'})

    def test_dispatch_event_raises_for_import_error(self):
        with patch('app.infrastructure.events.dispatcher.importlib.import_module', side_effect=ImportError('missing module')):
            with pytest.raises(ImportError, match='missing module'):
                dispatch_event({'event_type': 'demo'}, 'missing.handle')

    def test_dispatch_event_raises_for_missing_handler(self):
        with patch('app.infrastructure.events.dispatcher.importlib.import_module', return_value=ModuleType('fake_events')):
            with pytest.raises(AttributeError):
                dispatch_event({'event_type': 'demo'}, 'fake_events.handle')

    def test_dispatch_event_raises_when_handler_execution_fails(self):
        fake_module = ModuleType('fake_events')

        def _boom(_):
            raise RuntimeError('handler failed')

        fake_module.handle = _boom

        with patch('app.infrastructure.events.dispatcher.importlib.import_module', return_value=fake_module):
            with pytest.raises(RuntimeError, match='handler failed'):
                dispatch_event({'event_type': 'demo'}, 'fake_events.handle')


class TestEventBus:
    def test_subscribe_supports_callable_and_deduplicates_paths(self):
        task_queue = MagicMock()
        bus = EventBus(task_queue)

        def handle(event):
            return event

        bus.subscribe(DatasourceCreated, handle)
        bus.subscribe(DatasourceCreated, handle)
        bus.subscribe(DatasourceCreated, 'custom.handler')

        subscriptions = bus.get_subscriptions()
        assert subscriptions['DatasourceCreated'] == [
            f'{__name__}.handle',
            'custom.handler',
        ]

    def test_get_handler_path_raises_when_module_missing(self):
        task_queue = MagicMock()
        bus = EventBus(task_queue)

        class _Callable:
            __module__ = None
            __name__ = 'callable'

            def __call__(self, event):
                return event

        with patch('app.infrastructure.events.event_bus.inspect.getmodule', return_value=None):
            with pytest.raises(ValueError, match='Cannot determine module'):
                bus._get_handler_path(_Callable())

    def test_publish_no_handlers_is_noop(self):
        task_queue = MagicMock()
        bus = EventBus(task_queue)

        bus.publish(AppExecutionCompleted(1, 2, 'report_push', '日报', 'manual', 100))

        task_queue.enqueue.assert_not_called()

    def test_publish_enqueues_each_handler_and_keeps_going_on_failure(self):
        task_queue = MagicMock()
        task_queue.enqueue.side_effect = [MagicMock(id='job-1'), RuntimeError('queue failed')]
        bus = EventBus(task_queue)
        bus.subscribe(AppExecutionCompleted, 'handlers.one')
        bus.subscribe(AppExecutionCompleted, 'handlers.two')
        event = AppExecutionCompleted(1, 2, 'report_push', '日报', 'manual', 100)

        bus.publish(event)

        assert task_queue.enqueue.call_count == 2
        first_call = task_queue.enqueue.call_args_list[0]
        assert first_call.args[0] == 'app.infrastructure.events.dispatcher.dispatch_event'
        assert first_call.kwargs['handler_path'] == 'handlers.one'
        assert first_call.kwargs['event_dict']['event_type'] == 'app.execution.completed'

    def test_publish_batch_publishes_each_event(self):
        task_queue = MagicMock()
        bus = EventBus(task_queue)
        bus.publish = MagicMock()
        events = [
            AppExecutionCompleted(1, 2, 'report_push', '日报', 'manual', 100),
            AppExecutionCompleted(2, 2, 'report_push', '日报', 'manual', 200),
        ]

        bus.publish_batch(events)

        assert bus.publish.call_count == 2


class TestRegistry:
    def test_register_event_handlers_wires_expected_subscriptions(self):
        event_bus = MagicMock()
        event_bus.get_subscriptions.return_value = {'DatasourceCreated': ['handler']}

        register_event_handlers(event_bus)

        assert event_bus.subscribe.call_count == 13
        subscribed_pairs = [
            (call.args[0].__name__, call.args[1])
            for call in event_bus.subscribe.call_args_list
        ]
        assert ('DatasourceCreated', 'app.infrastructure.events.handlers.datasource_handler.on_datasource_created') in subscribed_pairs
        assert ('DatasetCreated', 'app.infrastructure.events.handlers.dataset_handler.on_dataset_created') in subscribed_pairs
        assert ('TaskExecutionFailed', 'app.infrastructure.events.handlers.extraction_handler.on_task_execution_failed') in subscribed_pairs
        assert ('AppExecutionCompleted', 'app.infrastructure.events.handlers.app_handler.on_execution_completed') in subscribed_pairs


@pytest.mark.parametrize(
    ('handler', 'event_dict', 'expected_field'),
    [
        (on_dataset_created, {'dataset_id': 1, 'dataset_code': 'orders', 'dataset_name': '订单'}, 'dataset_id'),
        (on_dataset_updated, {'dataset_id': 2, 'changes': {'name': 'new'}}, 'changes'),
        (on_dataset_deleted, {'dataset_id': 3, 'dataset_code': 'old_orders'}, 'dataset_code'),
        (on_datasource_created, {'datasource_id': 4, 'name': 'pg_dw', 'source_type': 'postgresql'}, 'source_type'),
        (on_datasource_updated, {'datasource_id': 5, 'changes': {'host': 'new-host'}}, 'changes'),
        (on_datasource_deleted, {'datasource_id': 6, 'name': 'legacy_dw'}, 'name'),
        (on_task_created, {'task_id': 7, 'task_name': 'sync_orders', 'dataset_id': 10}, 'task_name'),
        (on_task_executed, {'task_id': 8, 'run_id': 11, 'executor_id': 'u1'}, 'run_id'),
        (on_task_execution_completed, {'task_id': 9, 'run_id': 12, 'success': True, 'extracted_rows': 100}, 'success'),
    ],
)
def test_event_handlers_log_success_payloads(handler, event_dict, expected_field):
    module = sys.modules[handler.__module__]

    with patch.object(module, 'logger') as mock_logger:
        handler(event_dict)

    mock_logger.info.assert_called_once()
    extra = mock_logger.info.call_args.kwargs['extra']
    assert expected_field in extra


def test_extraction_failed_handler_logs_error_payload():
    with patch('app.infrastructure.events.handlers.extraction_handler.logger') as mock_logger:
        on_task_execution_failed({'task_id': 1, 'run_id': 2, 'error_message': 'boom', 'retry_count': 3})

    mock_logger.error.assert_called_once()
    extra = mock_logger.error.call_args.kwargs['extra']
    assert extra['error_message'] == 'boom'


@pytest.mark.parametrize(
    ('module_path', 'handler_name', 'logger_method'),
    [
        ('app.infrastructure.events.handlers.dataset_handler', 'on_dataset_created', 'info'),
        ('app.infrastructure.events.handlers.dataset_handler', 'on_dataset_updated', 'info'),
        ('app.infrastructure.events.handlers.dataset_handler', 'on_dataset_deleted', 'info'),
        ('app.infrastructure.events.handlers.datasource_handler', 'on_datasource_created', 'info'),
        ('app.infrastructure.events.handlers.datasource_handler', 'on_datasource_updated', 'info'),
        ('app.infrastructure.events.handlers.datasource_handler', 'on_datasource_deleted', 'info'),
        ('app.infrastructure.events.handlers.extraction_handler', 'on_task_created', 'info'),
        ('app.infrastructure.events.handlers.extraction_handler', 'on_task_executed', 'info'),
        ('app.infrastructure.events.handlers.extraction_handler', 'on_task_execution_completed', 'info'),
        ('app.infrastructure.events.handlers.extraction_handler', 'on_task_execution_failed', 'error'),
    ],
)
def test_event_handlers_reraise_when_logging_step_fails(module_path, handler_name, logger_method):
    module = sys.modules[module_path]
    handler = getattr(module, handler_name)

    with patch.object(module, 'logger') as mock_logger:
        failing = getattr(mock_logger, logger_method)
        failing.side_effect = [RuntimeError('log failed'), None]

        with pytest.raises(RuntimeError, match='log failed'):
            handler({'task_id': 1, 'dataset_id': 2, 'datasource_id': 3})

        assert getattr(mock_logger, 'error').called
