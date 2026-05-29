from unittest.mock import Mock

from dependency_injector import providers

from app.application.extraction.handlers.execute_task_handler import ExecuteTaskHandler
from app.application.semantic.data_asset_agent_app import DataAssetAgentApp
from app.di.container import Container
from app.infrastructure.semantic.sql_modeling_agent_session_repository import (
    SqlModelingAgentSessionRepository,
)
from app.infrastructure.semantic.yaml_modeling_agent_session_repository import (
    YamlModelingAgentSessionRepository,
)


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


def test_semantic_modeling_copilot_repository_defaults_to_sql(tmp_path):
    container = Container()
    container.config.from_dict({
        "database_url": f"sqlite:///{tmp_path / 'copilot.db'}",
        "redis_url": "redis://localhost:6379/15",
        "semantic_modeling": {"copilot_store": "sql"},
    })

    repo = container.semantic_modeling_agent_session_repository()

    assert isinstance(repo, SqlModelingAgentSessionRepository)


def test_semantic_modeling_copilot_repository_can_use_yaml_for_local_fixtures(tmp_path):
    container = Container()
    container.config.from_dict({
        "database_url": f"sqlite:///{tmp_path / 'copilot.db'}",
        "redis_url": "redis://localhost:6379/15",
        "semantic_modeling": {"copilot_store": "yaml"},
    })

    repo = container.semantic_modeling_agent_session_repository()

    assert isinstance(repo, YamlModelingAgentSessionRepository)


def test_data_asset_agent_app_wires_to_platform_agent_runtime():
    container = Container()

    app = container.data_asset_agent_app()

    assert isinstance(app, DataAssetAgentApp)
    assert app._runtime_service is container.agent_inference_runtime_service()
