import pytest

from app.application.semantic.cube_modeling_service import CubeModelingService
from app.domain.entities.data_source import DataSource
from app.shared.exceptions import ApplicationException


class _InMemoryCubeRepo:
    def __init__(self):
        self.items = {}

    def get(self, name):
        return self.items.get(name)

    def save(self, cube):
        self.items[cube.name] = cube
        return cube


class _FakeRegistryRepo:
    def __init__(self):
        self.calls = []
        self.committed = False

    def upsert(self, object_type, object_name, **kwargs):
        self.calls.append((object_type, object_name, kwargs))

    def commit(self):
        self.committed = True


class _FakeDefinitionService:
    def __init__(self):
        self.invalidated = False

    def invalidate_cache(self):
        self.invalidated = True


class _FakeRuntime:
    def __init__(self):
        self.resolved = []

    def resolve_datasource(self, source_id):
        self.resolved.append(source_id)
        return DataSource(
            id=source_id,
            name="mc_prod",
            source_type="maxcompute",
            connection_config={"project": "warehouse_prod"},
        )

    def resolve_cube_datasource(self, cube):
        self.resolved.append(cube.source_id)
        return self.resolve_datasource(cube.source_id)

    def resolve_source_binding_summary(self, cube):
        return {
            "source_id": cube.source_id,
            "source_name": "mc_prod",
            "source_type": "maxcompute",
            "database": cube.source_database,
            "schema": cube.source_schema,
            "display": cube.table,
        }


def test_generate_cube_draft_from_table(monkeypatch):
    class _FakeAdapter:
        def get_table_schema(self, database, table_ref):
            assert database == "warehouse_prod"
            assert table_ref == "dws.answer_records"
            return {
                "columns": [
                    {"name": "id", "type": "bigint", "comment": "主键", "is_primary_key": True},
                    {"name": "student_name", "type": "string", "comment": "学生姓名"},
                    {"name": "score", "type": "double", "comment": "得分"},
                ],
                "partitions": ["ds"],
                "comment": "答题记录表",
            }

        def close(self):
            return None

    monkeypatch.setattr(
        "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
        lambda source_type, config: _FakeAdapter(),
    )

    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(),
    )

    draft = service.generate_cube_draft(
        source_id=11,
        database="warehouse_prod",
        schema="dws",
        table="answer_records",
    )

    assert draft["status"] == "draft"
    assert draft["source_id"] == 11
    assert draft["source_database"] == "warehouse_prod"
    assert draft["source_schema"] == "dws"
    assert draft["table"] == "dws.answer_records"
    assert draft["dimensions"]["id"]["primary_key"] is True
    assert draft["measures"]["total_count"]["certified"] is True
    assert "sum_score" in draft["measures"]
    assert draft["entity_key"] == "id"
    assert draft["grain"] == "id"
    assert draft["partition"]["field"] == "ds"


def test_create_activate_and_deprecate_cube_updates_registry():
    cube_repo = _InMemoryCubeRepo()
    registry_repo = _FakeRegistryRepo()
    definition_service = _FakeDefinitionService()
    runtime = _FakeRuntime()
    service = CubeModelingService(
        cube_repo=cube_repo,
        runtime_binding_service=runtime,
        definition_service=definition_service,
        registry_repo=registry_repo,
    )

    cube = service.create_cube(
        {
            "name": "answer_records",
            "title": "答题记录",
            "table": "dws.answer_records",
            "domain_id": "academic",
            "source_id": 11,
            "source_database": "warehouse_prod",
            "status": "draft",
            "dimensions": {"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
            "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        }
    )

    assert cube.status == "draft"
    assert definition_service.invalidated is True
    assert registry_repo.committed is True
    assert registry_repo.calls[-1][2]["status"] == "draft"

    active_cube = service.activate_cube("answer_records")
    deprecated_cube = service.deprecate_cube("answer_records")

    assert active_cube.status == "active"
    assert deprecated_cube.status == "deprecated"
    assert cube_repo.get("answer_records").status == "deprecated"
    assert registry_repo.calls[-1][2]["status"] == "deprecated"


def test_create_cube_requires_source_id():
    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(),
    )

    with pytest.raises(ApplicationException, match="source_id"):
        service.create_cube(
            {
                "name": "broken_cube",
                "title": "缺失数据源",
                "domain_id": "academic",
                "table": "dws.answer_records",
                "dimensions": {"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id"}},
                "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
            }
        )


def test_create_cube_allows_missing_domain_id():
    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(),
    )

    cube = service.create_cube(
        {
            "name": "broken_cube",
            "title": "缺失领域",
            "table": "dws.answer_records",
            "source_id": 11,
            "dimensions": {"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id"}},
            "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        }
    )

    assert cube.domain_id is None
