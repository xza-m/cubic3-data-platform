import pytest

from app.application.semantic.cube_modeling_service import CubeModelingService
from app.domain.entities.data_source import DataSource
from app.domain.semantic.entities import CubeDefinition
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
    def __init__(self, *, source_type="maxcompute", connection_config=None):
        self.resolved = []
        self.source_type = source_type
        self.connection_config = connection_config or {"project": "warehouse_prod"}

    def resolve_datasource(self, source_id):
        self.resolved.append(source_id)
        return DataSource(
            id=source_id,
            name="mc_prod",
            source_type=self.source_type,
            connection_config=self.connection_config,
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


def test_create_revision_draft_from_active_cube_returns_unique_draft_copy_and_keeps_active_source():
    cube_repo = _InMemoryCubeRepo()
    cube_repo.save(
        CubeDefinition(
            name="answer_records",
            title="答题记录",
            table="dws.answer_records",
            source_id=11,
            status="active",
            dimensions={"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
            measures={"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        )
    )
    cube_repo.save(
        CubeDefinition(
            name="answer_records__revision_draft",
            title="答题记录",
            table="dws.answer_records",
            source_id=11,
            status="draft",
            dimensions={"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
            measures={"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        )
    )
    service = CubeModelingService(
        cube_repo=cube_repo,
        runtime_binding_service=_FakeRuntime(),
    )

    draft = service.create_revision_draft("answer_records")

    assert draft.name == "answer_records__revision_draft_2"
    assert draft.status == "draft"
    assert draft.title == "答题记录"
    assert cube_repo.get("answer_records").status == "active"
    assert cube_repo.get("answer_records__revision_draft").status == "draft"
    assert cube_repo.get("answer_records__revision_draft_2") == draft


@pytest.mark.parametrize("status", ["draft", "deprecated"])
def test_create_revision_draft_rejects_non_active_cubes(status):
    cube_repo = _InMemoryCubeRepo()
    cube_repo.save(
        CubeDefinition(
            name="answer_records",
            title="答题记录",
            table="dws.answer_records",
            source_id=11,
            status=status,
            dimensions={"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
            measures={"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        )
    )
    service = CubeModelingService(
        cube_repo=cube_repo,
        runtime_binding_service=_FakeRuntime(),
    )

    with pytest.raises(ApplicationException, match="只有已发布 Cube 才能发起修订"):
        service.create_revision_draft("answer_records")


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


def test_generate_cube_draft_handles_adapter_failure(monkeypatch):
    class _BrokenAdapter:
        def get_table_schema(self, database, table_ref):
            raise RuntimeError(f"boom:{database}:{table_ref}")

        def close(self):
            return None

    monkeypatch.setattr(
        "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
        lambda source_type, config: _BrokenAdapter(),
    )
    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(),
    )

    with pytest.raises(ApplicationException, match="读取表结构失败"):
        service.generate_cube_draft(source_id=11, database="warehouse_prod", schema="dws", table="answer_records")


def test_update_cube_and_missing_cube_paths():
    cube_repo = _InMemoryCubeRepo()
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            source_id=11,
            dimensions={"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
            measures={"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        )
    )
    service = CubeModelingService(
        cube_repo=cube_repo,
        runtime_binding_service=_FakeRuntime(),
    )

    updated = service.update_cube("orders", {"title": "新订单标题"})
    assert updated.title == "新订单标题"

    with pytest.raises(ApplicationException, match="未找到 Cube"):
        service.update_cube("ghost", {"title": "missing"})

    with pytest.raises(ApplicationException, match="修改 Cube 名称"):
        service.update_cube("orders", {"name": "renamed"})

    with pytest.raises(ApplicationException, match="未找到 Cube"):
        service.activate_cube("ghost")


def test_normalize_humanize_and_type_helpers_cover_edge_cases():
    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(),
    )

    assert service._normalize_name("  Orders-Detail  ") == "orders_detail"
    assert service._normalize_name("!!!") == "cube_draft"
    assert service._humanize_name("daily_orders-report") == "Daily Orders Report"
    assert service._infer_dimension_type("created_at", "varchar") == "time"
    assert service._infer_dimension_type("amount", "decimal(18,2)") == "number"
    assert service._infer_dimension_type("is_active", "boolean") == "boolean"
    assert service._infer_dimension_type("name", "varchar") == "string"
    assert service._is_numeric_type("bigint") is True
    assert service._is_numeric_type("varchar") is False


def test_generate_cube_draft_covers_non_maxcompute_blank_columns_and_measure_fallback(monkeypatch):
    adapter_calls = []

    class _FakeAdapter:
        def get_table_schema(self, database, table_ref):
            adapter_calls.append((database, table_ref))
            return {
                "columns": [
                    {"name": "  ", "type": "varchar"},
                    {"name": "row_id", "type": "varchar", "comment": "行主键", "is_primary_key": True},
                ],
                "partitions": [],
            }

        def close(self):
            return None

    monkeypatch.setattr(
        "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
        lambda source_type, config: adapter_calls.append((source_type, dict(config))) or _FakeAdapter(),
    )

    service = CubeModelingService(
        cube_repo=_InMemoryCubeRepo(),
        runtime_binding_service=_FakeRuntime(
            source_type="mysql",
            connection_config={"host": "localhost", "port": 3306},
        ),
    )
    monkeypatch.setattr(service, "_build_measures", lambda columns, dimensions: {})

    draft = service.generate_cube_draft(
        source_id=11,
        database="warehouse_app",
        table="orders",
        name="  Orders Draft  ",
    )

    assert adapter_calls[0] == ("mysql", {"host": "localhost", "port": 3306, "database": "warehouse_app"})
    assert adapter_calls[1] == ("warehouse_app", "orders")
    assert "project" not in adapter_calls[0][1]
    assert draft["name"] == "orders_draft"
    assert draft["dimensions"] == {
        "row_id": {
            "title": "行主键",
            "type": "string",
            "sql": "{CUBE}.row_id",
            "primary_key": True,
        }
    }
    assert draft["measures"]["total_count"]["sql"] == "{CUBE}.row_id"


def test_create_cube_rejects_invalid_status_and_duplicate_name(monkeypatch):
    cube_repo = _InMemoryCubeRepo()
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            source_id=11,
            dimensions={"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
            measures={"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        )
    )
    service = CubeModelingService(
        cube_repo=cube_repo,
        runtime_binding_service=_FakeRuntime(),
    )

    class _InvalidCube:
        def __init__(self, **payload):
            self.name = payload["name"]
            self.status = payload["status"]
            self.source_id = payload["source_id"]

    monkeypatch.setattr(
        "app.application.semantic.cube_modeling_service.CubeDefinition",
        _InvalidCube,
    )

    with pytest.raises(ApplicationException, match="不支持的 Cube 状态"):
        service.create_cube(
            {
                "name": "draft_orders",
                "title": "草稿订单",
                "table": "dws.orders",
                "source_id": 11,
                "status": "invalid",
                "dimensions": {"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
                "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
            }
        )

    with pytest.raises(ApplicationException, match="Cube 已存在"):
        service.create_cube(
            {
                "name": "orders",
                "title": "重复订单",
                "table": "dws.orders",
                "source_id": 11,
                "status": "draft",
                "dimensions": {"id": {"title": "主键", "type": "number", "sql": "{CUBE}.id", "primary_key": True}},
                "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
            }
        )
