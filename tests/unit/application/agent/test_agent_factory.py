from types import SimpleNamespace

import app.application.agent.agent_factory as agent_factory_module


class FakeAgentService:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeRepo:
    def __init__(self, session, result):
        self.session = session
        self._result = result

    def find_all(self, **kwargs):
        return self._result


def test_get_data_agent_service_returns_none_when_no_enabled_instance(monkeypatch) -> None:
    monkeypatch.setattr(
        agent_factory_module,
        "AgentService",
        FakeAgentService,
    )
    monkeypatch.setattr(
        "app.infrastructure.repositories.app_instance_repository.AppInstanceRepository",
        lambda session: FakeRepo(session, ([], 0)),
    )

    assert agent_factory_module.get_data_agent_service(object(), object(), object()) is None
    assert agent_factory_module.get_data_agent_config() is None


def test_get_data_agent_service_builds_adapter_and_project_database(monkeypatch) -> None:
    instance = SimpleNamespace(
        config={"knowledge": {"datasource_id": 9}, "agent": {"max_loop_rounds": 5}},
    )
    datasource = SimpleNamespace(
        source_type="maxcompute",
        connection_config={"project": "dw_project", "database": "fallback_db"},
    )
    db_session = SimpleNamespace(
        query=lambda model: SimpleNamespace(
            filter_by=lambda **kwargs: SimpleNamespace(first=lambda: datasource)
        )
    )
    monkeypatch.setattr(agent_factory_module, "AgentService", FakeAgentService)
    monkeypatch.setattr(
        "app.infrastructure.repositories.app_instance_repository.AppInstanceRepository",
        lambda session: FakeRepo(session, ([instance], 1)),
    )
    monkeypatch.setattr(agent_factory_module, "db", SimpleNamespace(session=db_session))
    monkeypatch.setattr(
        agent_factory_module.AdapterFactory,
        "create_adapter",
        lambda source_type, config: ("adapter", source_type, config),
    )

    service = agent_factory_module.get_data_agent_service("loop", "prompt", "registry")
    config = agent_factory_module.get_data_agent_config()

    assert service.kwargs["loop"] == "loop"
    assert service.kwargs["default_adapter"][0] == "adapter"
    assert service.kwargs["default_database"] == "dw_project"
    assert config == instance.config


def test_get_data_agent_service_handles_missing_datasource(monkeypatch) -> None:
    instance = SimpleNamespace(config={"knowledge": {"datasource_id": 9}})
    db_session = SimpleNamespace(
        query=lambda model: SimpleNamespace(
            filter_by=lambda **kwargs: SimpleNamespace(first=lambda: None)
        )
    )
    monkeypatch.setattr(agent_factory_module, "AgentService", FakeAgentService)
    monkeypatch.setattr(
        "app.infrastructure.repositories.app_instance_repository.AppInstanceRepository",
        lambda session: FakeRepo(session, ([instance], 1)),
    )
    monkeypatch.setattr(agent_factory_module, "db", SimpleNamespace(session=db_session))

    service = agent_factory_module.get_data_agent_service("loop", "prompt", "registry")

    assert service.kwargs["default_adapter"] is None
    assert service.kwargs["default_database"] is None
