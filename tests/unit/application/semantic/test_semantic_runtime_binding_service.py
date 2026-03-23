from app.application.semantic.semantic_runtime_binding_service import SemanticRuntimeBindingService
from app.domain.entities.data_source import DataSource
from app.domain.semantic.dialects import PostgreSQLDialect
from app.domain.semantic.entities import CubeDefinition, DimensionDef, MeasureDef
from app.infrastructure.semantic.adapter_schema_inspector import AdapterSchemaInspector


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
