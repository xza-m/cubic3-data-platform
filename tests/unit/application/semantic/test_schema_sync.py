"""Phase 1.5 — SchemaSyncService 单元测试"""
from types import SimpleNamespace
import pytest

from app.application.semantic.schema_sync_service import SchemaSyncService, SyncReport
from app.domain.semantic.entities import (
    CubeDefinition,
    DimensionDef,
    JoinDef,
    MeasureDef,
    ViewDefinition,
)
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.semantic.ports.schema_inspector import ISchemaInspector


class MockInspector(ISchemaInspector):
    def __init__(self, tables=None):
        self._tables = tables or {}

    def get_table_columns(self, table_name):
        return self._tables.get(table_name, [])

    def fetch_dict_enums(self, dict_type):
        return None


class MockCubeRepo(ICubeRepository):
    def __init__(self, cubes):
        self._cubes = {c.name: c for c in cubes}

    def list_all(self):
        return list(self._cubes.values())

    def get(self, name):
        return self._cubes.get(name)

    def save(self, cube):
        self._cubes[cube.name] = cube

    def delete(self, name):
        return self._cubes.pop(name, None) is not None


class MockViewRepo:
    def __init__(self, views):
        self._views = {v.name: v for v in views}

    def list_all(self):
        return list(self._views.values())

    def get(self, name):
        return self._views.get(name)


class MockRegistryRepo:
    def __init__(self):
        self.upserts = []
        self.commit_count = 0

    def upsert(self, object_type, object_name, **kwargs):
        self.upserts.append((object_type, object_name, kwargs))

    def commit(self):
        self.commit_count += 1


class MockRuntimeBindingService:
    def __init__(self, inspectors):
        self.inspectors = inspectors

    def create_inspector_for_cube(self, cube):
        return self.inspectors[cube.name]


def _make_cube(name="test_cube", table="test_table", dims=None):
    return CubeDefinition(
        name=name,
        title=name,
        table=table,
        dimensions=dims or {
            "id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True),
            "name": DimensionDef(title="Name", type="string", sql="{CUBE}.name"),
            "age": DimensionDef(title="Age", type="number", sql="{CUBE}.age"),
        },
        measures={"cnt": MeasureDef(title="Count", type="count", sql="{CUBE}.id")},
    )


class TestSchemaSyncService:

    def test_no_drift_when_matching(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
                {"name": "name", "type": "STRING"},
                {"name": "age", "type": "BIGINT"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        assert report.checked_cubes == 1
        assert not report.has_drifts

    def test_missing_in_physical(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
                {"name": "name", "type": "STRING"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        missing = [d for d in report.drifts if d.kind == "missing_in_physical"]
        assert len(missing) == 1
        assert missing[0].column == "age"

    def test_missing_in_cube(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
                {"name": "name", "type": "STRING"},
                {"name": "age", "type": "BIGINT"},
                {"name": "extra_col", "type": "STRING"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        extra = [d for d in report.drifts if d.kind == "missing_in_cube"]
        assert len(extra) == 1
        assert extra[0].column == "extra_col"

    def test_type_mismatch(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
                {"name": "name", "type": "BIGINT"},
                {"name": "age", "type": "BIGINT"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        mismatches = [d for d in report.drifts if d.kind == "type_mismatch"]
        assert len(mismatches) == 1
        assert mismatches[0].column == "name"

    def test_skipped_when_no_physical_table(self):
        cube = _make_cube()
        inspector = MockInspector(tables={})
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        assert report.checked_cubes == 0
        assert "test_cube" in report.skipped_cubes

    def test_ds_partition_column_ignored(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
                {"name": "name", "type": "STRING"},
                {"name": "age", "type": "BIGINT"},
                {"name": "ds", "type": "STRING"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        assert not report.has_drifts

    def test_check_single_cube(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
                {"name": "name", "type": "STRING"},
                {"name": "age", "type": "BIGINT"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_cube("test_cube")
        assert report.total_cubes == 1
        assert report.checked_cubes == 1
        assert not report.has_drifts

    def test_report_to_dict(self):
        cube = _make_cube()
        inspector = MockInspector(tables={
            "test_table": [
                {"name": "id", "type": "STRING"},
            ]
        })
        svc = SchemaSyncService(MockCubeRepo([cube]), inspector)
        report = svc.check_all()
        d = report.to_dict()
        assert "drift_count" in d
        assert "drifts" in d
        assert isinstance(d["drifts"], list)

    def test_detect_missing_join_column(self):
        cube = CubeDefinition(
            name="fact_orders",
            title="订单",
            table="fact_orders",
            dimensions={
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id", primary_key=True),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.order_id")},
            joins={
                "user": JoinDef(
                    cube="dim_user",
                    type="left",
                    sql="{CUBE}.user_id = {dim_user}.user_id",
                )
            },
        )
        target = CubeDefinition(
            name="dim_user",
            title="用户",
            table="dim_user",
            dimensions={"user_id": DimensionDef(title="用户ID", type="string", sql="{CUBE}.user_id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.user_id")},
        )
        inspector = MockInspector(tables={
            "fact_orders": [{"name": "order_id", "type": "STRING"}],
            "dim_user": [{"name": "user_id", "type": "STRING"}],
        })
        svc = SchemaSyncService(MockCubeRepo([cube, target]), inspector)
        report = svc.check_all()
        assert any(d.kind == "missing_join_column" for d in report.drifts)

    def test_detect_invalid_view_reference(self):
        cube = CubeDefinition(
            name="student",
            title="学生",
            table="dim_student",
            dimensions={"user_id": DimensionDef(title="用户ID", type="string", sql="{CUBE}.user_id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.user_id")},
        )
        view = ViewDefinition(
            name="broken_view",
            title="损坏视图",
            cubes=[{"join_path": "student.school", "includes": ["school_name"]}],
        )
        inspector = MockInspector(tables={"dim_student": [{"name": "user_id", "type": "STRING"}]})
        svc = SchemaSyncService(
            MockCubeRepo([cube]),
            inspector,
            view_repo=MockViewRepo([view]),
        )
        report = svc.check_all()
        assert any(d.object_type == "view" and d.kind == "invalid_view_reference" for d in report.drifts)

    def test_check_all_skips_cube_when_enum_loading_raises_and_check_cube_handles_missing(self):
        cube = CubeDefinition(
            name="orders",
            title="订单",
            table="fact_orders",
            dimensions={
                "status": DimensionDef(
                    title="状态",
                    type="string",
                    sql="{CUBE}.status",
                    enum_source={"dict_type": "order_status"},
                ),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.status")},
        )

        class ExplodingInspector(MockInspector):
            def fetch_dict_enums(self, dict_type):
                raise RuntimeError(f"boom: {dict_type}")

        svc = SchemaSyncService(
            MockCubeRepo([cube]),
            ExplodingInspector({"fact_orders": [{"name": "status", "type": "STRING"}]}),
        )

        report = svc.check_all()
        missing_report = svc.check_cube("missing_cube")

        assert report.checked_cubes == 0
        assert report.skipped_cubes == ["orders"]
        assert missing_report.skipped_cubes == ["missing_cube"]

    def test_check_all_records_join_drifts_closes_managed_inspectors_and_syncs_registry(self):
        source_cube = CubeDefinition(
            name="orders",
            title="订单",
            table="fact_orders",
            source_id=1,
            dimensions={
                "status": DimensionDef(
                    title="状态",
                    type="string",
                    sql="{CUBE}.status",
                    enum_source={"dict_type": "order_status"},
                ),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.status")},
            joins={
                "ghost": JoinDef(cube="ghost_cube", type="left", sql="{CUBE}.ghost_id = {ghost_cube}.id"),
                "cross": JoinDef(cube="users", type="left", sql="{CUBE}.user_id = {users}.id"),
                "bad_target": JoinDef(cube="same_source", type="left", sql="{CUBE}.same_id = {same_source}.missing_id"),
            },
        )
        cross_cube = CubeDefinition(
            name="users",
            title="用户",
            table="dim_users",
            source_id=2,
            dimensions={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        )
        same_source_cube = CubeDefinition(
            name="same_source",
            title="同源",
            table="dim_same_source",
            source_id=1,
            dimensions={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        )
        orders_inspector = MockInspector(
            {"fact_orders": [{"name": "status", "type": "STRING"}, {"name": "ghost_id", "type": "STRING"}, {"name": "user_id", "type": "STRING"}, {"name": "same_id", "type": "STRING"}]}
        )
        orders_inspector._adapter = SimpleNamespace(close=lambda: setattr(orders_inspector, "_closed", True))
        same_source_inspector = MockInspector({"dim_same_source": [{"name": "id", "type": "STRING"}]})
        same_source_inspector._adapter = SimpleNamespace(close=lambda: setattr(same_source_inspector, "_closed", True))
        registry = MockRegistryRepo()

        svc = SchemaSyncService(
            MockCubeRepo([source_cube, cross_cube, same_source_cube]),
            MockInspector({}),
            registry_repo=registry,
            runtime_binding_service=MockRuntimeBindingService(
                {
                    "orders": orders_inspector,
                    "same_source": same_source_inspector,
                    "users": MockInspector({"dim_users": [{"name": "id", "type": "STRING"}]}),
                }
            ),
        )

        report = svc.check_all()
        kinds = {item.kind for item in report.drifts}

        assert {"enum_source_unavailable", "missing_join_target_cube", "cross_source_join", "missing_join_target_column"} <= kinds
        assert getattr(orders_inspector, "_closed", False) is True
        assert getattr(same_source_inspector, "_closed", False) is True
        assert registry.commit_count == 1
        assert any(object_type == "cube" and object_name == "orders" for object_type, object_name, _ in registry.upserts)

    def test_check_views_covers_invalid_paths_missing_cubes_and_unknown_fields(self):
        orders = CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            dimensions={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        )
        customers = CubeDefinition(
            name="customers",
            title="客户",
            table="dws.customers",
            dimensions={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        )
        views = [
            ViewDefinition(name="blank", title="空路径", cubes=[{"join_path": " ", "includes": ["id"]}]),
            ViewDefinition(name="missing_root", title="缺失根", cubes=[{"join_path": "ghost", "includes": ["id"]}]),
            ViewDefinition(name="missing_target", title="缺失终点", cubes=[{"join_path": "orders.ghost", "includes": ["id"]}]),
            ViewDefinition(name="bad_edge", title="坏边", cubes=[{"join_path": "orders.customers", "includes": ["id"]}]),
            ViewDefinition(name="bad_field", title="坏字段", cubes=[{"join_path": "orders", "includes": ["ghost_field"]}]),
        ]

        svc = SchemaSyncService(
            MockCubeRepo([orders, customers]),
            MockInspector({"dws.orders": [{"name": "id", "type": "STRING"}], "dws.customers": [{"name": "id", "type": "STRING"}]}),
            view_repo=MockViewRepo(views),
        )

        report = svc.check_all()
        messages = [item.detail for item in report.drifts if item.object_type == "view"]

        assert any("join_path 不能为空" in message for message in messages)
        assert any("引用了不存在的 Cube 'ghost'" in message for message in messages)
        assert any("终点 Cube 不存在" in message for message in messages)
        assert any("JOIN 路径无效" in message for message in messages)
        assert any("引用了不存在的字段" in message for message in messages)

    def test_helper_paths_cover_inspector_close_view_skip_and_column_extract_fallback(self):
        class _BrokenAdapter:
            def close(self):
                raise RuntimeError("close failed")

        inspector = MockInspector()
        setattr(inspector, "_managed_by_schema_sync", True)
        setattr(inspector, "_adapter", _BrokenAdapter())
        SchemaSyncService._close_inspector(inspector)

        orders = CubeDefinition(
            name="orders",
            title="订单",
            table="fact_orders",
            dimensions={"id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
            joins={"student": JoinDef(cube="student", type="left", sql="{CUBE}.student_id = {student}.id")},
        )
        student = CubeDefinition(
            name="student",
            title="学生",
            table="dim_student",
            dimensions={"id": DimensionDef(title="学生ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        )
        svc = SchemaSyncService(
            MockCubeRepo([orders, student]),
            MockInspector({"fact_orders": [{"name": "id", "type": "STRING"}], "dim_student": [{"name": "id", "type": "STRING"}]}),
            view_repo=MockViewRepo(
                [
                    ViewDefinition(name="student_view", title="学生视图", cubes=[{"join_path": "student", "includes": "*"}]),
                    ViewDefinition(name="orders_view", title="订单视图", cubes=[{"join_path": "orders.student", "includes": "*"}]),
                ]
            ),
        )
        report = SyncReport(total_cubes=1)

        svc._check_views(report, cube_name="orders")

        assert report.drifts == []
        assert SchemaSyncService._extract_column_name("UPPER(name)", "orders") is None
