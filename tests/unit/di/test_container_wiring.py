from unittest.mock import Mock

from dependency_injector import providers

from app.application.extraction.handlers.execute_task_handler import ExecuteTaskHandler
from app.di.container import Container


def test_execute_task_handler_container_wires_task_queue_manager():
    container = Container()
    extraction_repository = Mock()
    task_queue = Mock()
    event_bus = Mock()

    container.extraction_repository.override(providers.Object(extraction_repository))
    container.task_queue.override(providers.Object(task_queue))
    container.event_bus.override(providers.Object(event_bus))

    handler = container.execute_task_handler()

    assert isinstance(handler, ExecuteTaskHandler)
    assert handler._extraction_repo is extraction_repository
    assert handler._task_queue is task_queue
    assert handler._event_bus is event_bus
