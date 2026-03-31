import pytest

from app.application.semantic.semantic_runtime_binding_service import SemanticRuntimeBindingService
from app.domain.entities.data_source import DataSource
from app.domain.semantic.dialects import MaxComputeDialect, PostgreSQLDialect
from app.domain.semantic.entities import CubeDefinition, DimensionDef, MeasureDef
from app.infrastructure.semantic.adapter_schema_inspector import AdapterSchemaInspector
from app.shared.exceptions import ApplicationException


class _FakeDatasourceRepo:
    def __init__(self, items):
        self._items = {item.id: item for item in items}

    def find_by_id(self, datasource_id):
        return self._items.get(datasource_id)


def _build_cube(**kwargs):
    payload = {
        "name": "orders",
        "title": "订单",
        "table": "public.orders",
        "source_id": 1,
        "source_database": "analytics",
        "dimensions": {
            "id": DimensionDef(title="主键", type="number", sql="{CUBE}.id", primary_key=True),
        },
        "measures": {
            "total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id"),
        },
    }
    payload.update(kwargs)
    return CubeDefinition(**payload)


def test_create_adapter_and_inspector_are_resolved_by_source(monkeypatch):
    calls = []

    class _FakeAdapter:
        def close(self):
            return None

    def _fake_create_adapter(source_type, config):
        calls.append((source_type, config))
        return _FakeAdapter()

    monkeypatch.setattr(
        "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
        _fake_create_adapter,
    )

    service = SemanticRuntimeBindingService(
        _FakeDatasourceRepo(
            [
                DataSource(
                    id=1,
                    name="pg_analytics",
                    source_type="postgresql",
                    connection_config={"host": "localhost", "database": "old_db"},
                )
            ]
        )
    )

    cube = _build_cube(source_id=1, source_database="analytics_dw")
    adapter, datasource, database = service.create_adapter_for_cube(cube)
    inspector = service.create_inspector_for_cube(cube)

    assert isinstance(adapter, _FakeAdapter)
    assert datasource.name == "pg_analytics"
    assert database == "analytics_dw"
    assert calls[-1][0] == "postgresql"
    assert calls[-1][1]["database"] == "analytics_dw"
    assert isinstance(inspector, AdapterSchemaInspector)
    assert inspector._database == "analytics_dw"
    assert inspector._source_type == "postgresql"


def test_create_adapter_uses_project_for_maxcompute(monkeypatch):
    calls = []

    class _FakeAdapter:
        def close(self):
            return None

    monkeypatch.setattr(
        "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
        lambda source_type, config: calls.append((source_type, config)) or _FakeAdapter(),
    )

    service = SemanticRuntimeBindingService(
        _FakeDatasourceRepo(
            [
                DataSource(
                    id=3,
                    name="mc_prod",
                    source_type="maxcompute",
                    connection_config={"project": "legacy_project"},
                )
            ]
        )
    )

    adapter, datasource, database = service.create_adapter_for_cube(
        _build_cube(source_id=3, source_database="dw_prod", data_source="maxcompute")
    )

    assert isinstance(adapter, _FakeAdapter)
    assert datasource.source_type == "maxcompute"
    assert database == "dw_prod"
    assert calls[-1] == ("maxcompute", {"project": "dw_prod"})


def test_resolve_dialect_and_binding_summary():
    repo = _FakeDatasourceRepo(
        [
            DataSource(
                id=2,
                name="pg_analytics",
                source_type="postgresql",
                connection_config={"database": "analytics_dw"},
            )
        ]
    )
    service = SemanticRuntimeBindingService(repo)
    cube = _build_cube(source_id=2, source_database="analytics_dw", source_schema="mart")

    summary = service.resolve_source_binding_summary(cube)
    dialect = service.resolve_dialect_for_cube(cube)

    assert summary == {
        "source_id": 2,
        "source_name": "pg_analytics",
        "source_type": "postgresql",
        "database": "analytics_dw",
        "schema": "mart",
        "display": "public.orders",
    }
    assert isinstance(dialect, PostgreSQLDialect)


def test_resolve_datasource_and_database_cover_error_and_fallback_paths():
    repo = _FakeDatasourceRepo(
        [
            DataSource(
                id=3,
                name="mc_prod",
                source_type="maxcompute",
                connection_config={"project": "dw_prod"},
            ),
            DataSource(
                id=4,
                name="legacy_dw",
                source_type="oracle",
                connection_config={"database": "legacy_dw"},
            ),
        ]
    )
    service = SemanticRuntimeBindingService(repo)
    cube = _build_cube(source_id=3, source_database=None, source_schema="ods", data_source="maxcompute")

    with pytest.raises(ApplicationException, match="未绑定 source_id"):
        service.resolve_datasource(None)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        service.resolve_datasource(999)

    datasource = service.resolve_cube_datasource(cube)
    database = service.resolve_database(cube, datasource)
    summary = service.resolve_source_binding_summary(_build_cube(source_id=999, source_database="fallback", source_schema="ods"))
    dialect = service.resolve_dialect_for_cube(_build_cube(source_id=4, source_database="legacy_dw"))

    assert datasource.name == "mc_prod"
    assert database == "dw_prod"
    assert summary["database"] == "fallback"
    assert isinstance(dialect, MaxComputeDialect)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        service.resolve_dialect_for_cube(_build_cube(source_id=999))


def test_fetch_dict_enums_and_resolve_adapter_for_cube_name_cover_close_and_missing(monkeypatch):
    class _FakeAdapter:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    created = []

    def _fake_create_adapter(source_type, config):
        adapter = _FakeAdapter()
        created.append((source_type, config, adapter))
        return adapter

    monkeypatch.setattr(
        "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
        _fake_create_adapter,
    )
    monkeypatch.setattr(
        "app.application.semantic.semantic_runtime_binding_service.AdapterSchemaInspector.fetch_dict_enums",
        lambda self, dict_type: {"1": dict_type},
    )

    service = SemanticRuntimeBindingService(
        _FakeDatasourceRepo(
            [
                DataSource(
                    id=1,
                    name="pg_analytics",
                    source_type="postgresql",
                    connection_config={"database": "analytics_dw"},
                )
            ]
        )
    )
    cube = _build_cube(source_id=1, source_database="analytics_dw")
    cube_repo = type("CubeRepo", (), {"get": lambda self, name: cube if name == "orders" else None})()

    enum_map = service.fetch_dict_enums(cube, "status")
    adapter, datasource, database, resolved_cube = service.resolve_adapter_for_cube_name("orders", cube_repo)

    assert enum_map == {"1": "status"}
    assert created[0][2].closed is True
    assert datasource.name == "pg_analytics"
    assert database == "analytics_dw"
    assert resolved_cube.name == "orders"

    with pytest.raises(ApplicationException, match="未找到 Cube"):
        service.resolve_adapter_for_cube_name("ghost", type("Repo", (), {"get": lambda self, name: None})())
