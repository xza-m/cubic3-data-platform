"""Phase 1.5 — SchemaSyncService 单元测试"""
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
