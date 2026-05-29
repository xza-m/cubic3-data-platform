from unittest.mock import Mock

from dependency_injector import providers

from app.application.extraction.handlers.execute_task_handler import ExecuteTaskHandler
from app.application.semantic.data_asset_agent_app import DataAssetAgentApp
from app.di.container import Container
from app.infrastructure.agent_inference_runtime.codex_ws_client import CodexAppServerWebSocketClient
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


def test_codex_run_service_wires_real_ws_client(tmp_path):
    container = Container()
    container.config.from_dict({
        "agent_codex": {
            "endpoint": "ws://127.0.0.1:8799",
            "project_root": str(tmp_path),
            "timeout_seconds": 5,
        },
    })

    client = container.agent_codex_ws_client()

    assert isinstance(client, CodexAppServerWebSocketClient)
    assert client._endpoint == "ws://127.0.0.1:8799"
    assert client._project_root == str(tmp_path)
    assert client._runtime_workspace_roots == [str(tmp_path)]


def test_runtime_management_codex_ws_client_factory_uses_management_config(tmp_path):
    container = Container()
    env_root = tmp_path / "env"
    managed_root = tmp_path / "managed"
    container.config.from_dict({
        "agent_openai": {"api_key": "", "model": ""},
        "agent_codex": {
            "enabled": True,
            "transport": "ws",
            "endpoint": "ws://127.0.0.1:8799",
            "project_root": str(env_root),
            "timeout_seconds": 5,
        },
    })

    client = container.agent_codex_ws_client_factory()({
        "enabled": True,
        "transport": "ws",
        "endpoint": "ws://127.0.0.1:8801",
        "project_root": str(env_root),
        "timeout_seconds": 5,
        "provider_extra": {
            "project_root": str(managed_root),
            "runtime_workspace_roots": [str(managed_root), str(tmp_path / "shared")],
            "timeout_seconds": 7,
        },
    })

    assert isinstance(client, CodexAppServerWebSocketClient)
    assert client._endpoint == "ws://127.0.0.1:8801"
    assert client._project_root == str(managed_root)
    assert client._runtime_workspace_roots == [str(managed_root), str(tmp_path / "shared")]
    assert client._timeout_seconds == 7


def test_openai_runtime_adapter_uses_runtime_config_service():
    container = Container()

    class _ConfigService:
        def management_config(self, runtime_name):
            assert runtime_name == "openai_compatible"
            return {
                "enabled": True,
                "api_key": "runtime-key",
                "api_base": "https://runtime.openai.test/v1",
                "model": "runtime-model",
                "timeout": 8,
            }

    container.agent_runtime_config_service.override(providers.Factory(_ConfigService))

    adapter = container.agent_openai_runtime_adapter()

    assert adapter._current_config() == {
        "enabled": True,
        "api_key": "runtime-key",
        "api_base": "https://runtime.openai.test/v1",
        "model": "runtime-model",
        "timeout": 8.0,
    }


def test_codex_run_service_uses_runtime_config_service_for_current_ws_client(tmp_path):
    container = Container()
    project_root = tmp_path / "runtime-project"
    project_root.mkdir()

    class _ConfigService:
        def management_config(self, runtime_name):
            assert runtime_name == "codex_app_server"
            return {
                "enabled": True,
                "transport": "ws",
                "endpoint": "ws://127.0.0.1:8802",
                "project_root": str(tmp_path / "env-project"),
                "timeout_seconds": 5,
                "provider_extra": {
                    "project_root": str(project_root),
                    "runtime_workspace_roots": [str(project_root), str(tmp_path / "shared")],
                    "timeout_seconds": 9,
                },
            }

    container.agent_runtime_config_service.override(providers.Factory(_ConfigService))
    container.agent_inference_runtime_repository.override(providers.Object(object()))

    service = container.codex_run_service()
    client = service._current_client()

    assert isinstance(client, CodexAppServerWebSocketClient)
    assert client._endpoint == "ws://127.0.0.1:8802"
    assert client._project_root == str(project_root)
    assert client._runtime_workspace_roots == [str(project_root), str(tmp_path / "shared")]
    assert client._timeout_seconds == 9
