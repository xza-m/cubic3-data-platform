"""
种子数据测试
"""
import sys
from types import ModuleType
from unittest.mock import MagicMock

from app.infrastructure import seed


class _FakeQuery:
    def __init__(self, *, all_result=None, first_result=None):
        self._all_result = all_result or []
        self._first_result = first_result
        self.filter_kwargs = None

    def all(self):
        return self._all_result

    def filter_by(self, **kwargs):
        self.filter_kwargs = kwargs
        return self

    def first(self):
        return self._first_result


class _FakeSession:
    def __init__(self, queries):
        self.queries = list(queries)
        self.added = []
        self.commit = MagicMock()
        self.rollback = MagicMock()

    def query(self, *args, **kwargs):
        if not self.queries:
            raise AssertionError("unexpected query call")
        query = self.queries.pop(0)
        if isinstance(query, Exception):
            raise query
        return query

    def add(self, obj):
        self.added.append(obj)


class _FakeAppDefinition:
    code = "code"

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _FakeAppInstance:
    app_code = "app_code"
    name = "name"

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def _install_fake_module(monkeypatch, module_name: str, attr_name: str, value):
    module = ModuleType(module_name)
    setattr(module, attr_name, value)
    monkeypatch.setitem(sys.modules, module_name, module)


class TestSeedAppDefinitions:
    def test_seed_app_definitions_inserts_new_rows(self, monkeypatch):
        monkeypatch.setattr(
            seed,
            "BUILTIN_APP_DEFINITIONS",
            [
                {
                    "code": "demo",
                    "name": "Demo",
                    "category": "tool",
                    "description": "desc",
                    "config_schema": {"type": "object"},
                    "icon": "Icon",
                    "author": "system",
                    "version": "1.0.0",
                }
            ],
        )
        _install_fake_module(monkeypatch, "app.domain.entities.app_definition", "AppDefinition", _FakeAppDefinition)
        session = _FakeSession([_FakeQuery(all_result=[])])
        monkeypatch.setattr(seed.db, "session", session)
        mock_logger = MagicMock()
        monkeypatch.setattr(seed, "logger", mock_logger)

        seed.seed_app_definitions()

        assert len(session.added) == 1
        assert session.added[0].code == "demo"
        session.commit.assert_called_once()
        mock_logger.info.assert_called_once()

    def test_seed_app_definitions_updates_changed_schema(self, monkeypatch):
        monkeypatch.setattr(
            seed,
            "BUILTIN_APP_DEFINITIONS",
            [
                {
                    "code": "demo",
                    "name": "Demo",
                    "category": "tool",
                    "description": "new-desc",
                    "config_schema": {"type": "object", "required": ["id"]},
                    "icon": "Icon",
                    "author": "system",
                    "version": "1.0.0",
                }
            ],
        )
        _install_fake_module(monkeypatch, "app.domain.entities.app_definition", "AppDefinition", _FakeAppDefinition)
        existing = _FakeAppDefinition(code="demo", config_schema={"type": "object"}, description="old-desc")
        session = _FakeSession([
            _FakeQuery(all_result=[("demo",)]),
            _FakeQuery(first_result=existing),
        ])
        monkeypatch.setattr(seed.db, "session", session)
        monkeypatch.setattr(seed, "logger", MagicMock())

        seed.seed_app_definitions()

        assert existing.config_schema == {"type": "object", "required": ["id"]}
        assert existing.description == "new-desc"
        session.commit.assert_called_once()

    def test_seed_app_definitions_rolls_back_on_error(self, monkeypatch):
        _install_fake_module(monkeypatch, "app.domain.entities.app_definition", "AppDefinition", _FakeAppDefinition)
        session = _FakeSession([RuntimeError("boom")])
        monkeypatch.setattr(seed.db, "session", session)
        mock_logger = MagicMock()
        monkeypatch.setattr(seed, "logger", mock_logger)

        seed.seed_app_definitions()

        session.rollback.assert_called_once()
        mock_logger.warning.assert_called_once()

    def test_seed_app_definitions_skips_when_existing_rows_unchanged(self, monkeypatch):
        monkeypatch.setattr(
            seed,
            "BUILTIN_APP_DEFINITIONS",
            [
                {
                    "code": "demo",
                    "name": "Demo",
                    "category": "tool",
                    "description": "desc",
                    "config_schema": {"type": "object"},
                    "icon": "Icon",
                    "author": "system",
                    "version": "1.0.0",
                }
            ],
        )
        _install_fake_module(monkeypatch, "app.domain.entities.app_definition", "AppDefinition", _FakeAppDefinition)
        existing = _FakeAppDefinition(code="demo", config_schema={"type": "object"}, description="desc")
        session = _FakeSession([
            _FakeQuery(all_result=[("demo",)]),
            _FakeQuery(first_result=existing),
        ])
        monkeypatch.setattr(seed.db, "session", session)
        mock_logger = MagicMock()
        monkeypatch.setattr(seed, "logger", mock_logger)

        seed.seed_app_definitions()

        session.commit.assert_not_called()
        mock_logger.debug.assert_called_once()


class TestSeedSystemInstances:
    def test_seed_system_instances_inserts_missing_rows(self, monkeypatch):
        monkeypatch.setattr(
            seed,
            "BUILTIN_SYSTEM_INSTANCES",
            [
                {
                    "app_code": "schema_drift_check",
                    "name": "每日检测",
                    "description": "desc",
                    "config": {"enabled": True},
                    "schedule_type": "cron",
                    "schedule_config": {"cron": "0 3 * * *"},
                    "owner": "system",
                }
            ],
        )
        _install_fake_module(monkeypatch, "app.domain.entities.app_instance", "AppInstance", _FakeAppInstance)
        session = _FakeSession([_FakeQuery(all_result=[])])
        monkeypatch.setattr(seed.db, "session", session)
        mock_logger = MagicMock()
        monkeypatch.setattr(seed, "logger", mock_logger)

        seed.seed_system_instances()

        assert len(session.added) == 1
        assert session.added[0].app_code == "schema_drift_check"
        session.commit.assert_called_once()
        mock_logger.info.assert_called_once()

    def test_seed_system_instances_skips_existing_rows(self, monkeypatch):
        monkeypatch.setattr(
            seed,
            "BUILTIN_SYSTEM_INSTANCES",
            [
                {
                    "app_code": "schema_drift_check",
                    "name": "每日检测",
                    "schedule_type": "cron",
                }
            ],
        )
        _install_fake_module(monkeypatch, "app.domain.entities.app_instance", "AppInstance", _FakeAppInstance)
        session = _FakeSession([_FakeQuery(all_result=[_FakeAppInstance(app_code="schema_drift_check", name="每日检测")])])
        monkeypatch.setattr(seed.db, "session", session)
        mock_logger = MagicMock()
        monkeypatch.setattr(seed, "logger", mock_logger)

        seed.seed_system_instances()

        assert session.added == []
        session.commit.assert_not_called()
        mock_logger.debug.assert_called_once()

    def test_seed_system_instances_rolls_back_on_error(self, monkeypatch):
        _install_fake_module(monkeypatch, "app.domain.entities.app_instance", "AppInstance", _FakeAppInstance)
        session = _FakeSession([RuntimeError("boom")])
        monkeypatch.setattr(seed.db, "session", session)
        mock_logger = MagicMock()
        monkeypatch.setattr(seed, "logger", mock_logger)

        seed.seed_system_instances()

        session.rollback.assert_called_once()
        mock_logger.warning.assert_called_once()
