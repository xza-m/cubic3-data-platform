from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

from app.application.semantic.modeling_source_scanner import ModelingSourceScanner
from app.domain.semantic.modeling_build_project import ModelingBuildProject


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class FakeTableCacheService:
    def __init__(self, tables_by_db: Dict[str, List[Dict[str, Any]]]):
        self._tables_by_db = tables_by_db
        self.calls: List[tuple] = []

    def get_cached_tables(self, datasource_id, database, force_refresh=False):
        self.calls.append((datasource_id, database, force_refresh))
        return list(self._tables_by_db.get(database, [])), True


class FakeRuntimeBinding:
    def __init__(self, source_type: str = "maxcompute"):
        self._source_type = source_type

    def resolve_datasource(self, source_id):
        return SimpleNamespace(
            source_type=self._source_type,
            connection_config={"host": "x"},
        )


class FakeAdapter:
    def __init__(self, schema_by_table: Dict[str, Dict[str, Any]], failing: set[str] | None = None):
        self._schema_by_table = schema_by_table
        self._failing = failing or set()
        self.closed = False

    def get_table_schema(self, database, table):
        if table in self._failing:
            raise RuntimeError("schema read failed")
        return self._schema_by_table[table]

    def close(self):
        self.closed = True


def _columns(*specs: tuple) -> List[Dict[str, Any]]:
    cols = []
    for name, col_type, comment, *flags in specs:
        col = {"name": name, "type": col_type, "comment": comment}
        if flags and flags[0]:
            col["is_partition"] = True
        cols.append(col)
    return cols


def _schema(table_name: str, columns: List[Dict[str, Any]], comment: str = "") -> Dict[str, Any]:
    return {
        "table_name": table_name,
        "comment": comment,
        "columns": columns,
        "partitions": [c["name"] for c in columns if c.get("is_partition")],
    }


def _project(scope: Dict[str, Any]) -> ModelingBuildProject:
    return ModelingBuildProject(
        id="build-test",
        name="学情分析",
        business_domain="学情分析",
        created_by="alice",
        scope=scope,
    )


def _make_scanner(tables_by_db, schema_by_table, *, failing=None, source_type="maxcompute"):
    cache = FakeTableCacheService(tables_by_db)
    adapter = FakeAdapter(schema_by_table, failing=failing)

    def factory(_source_type, _config):
        return adapter

    scanner = ModelingSourceScanner(
        table_cache_service=cache,
        runtime_binding_service=FakeRuntimeBinding(source_type),
        adapter_factory=factory,
    )
    return scanner, cache, adapter


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_can_scan_requires_source_and_database():
    scanner, _cache, _adapter = _make_scanner({}, {})
    assert scanner.can_scan(_project({"source_id": 7, "database": "dw"})) is True
    assert scanner.can_scan(_project({"database": "dw"})) is False
    assert scanner.can_scan(_project({"source_id": 7})) is False
    # 无坐标直接返回空，交由上层降级
    assert scanner.scan(_project({})) == []


def test_scan_classifies_layers_and_writes_snapshot():
    tables_by_db = {
        "dw": [
            {"table_name": "dim_school_df", "comment": "学校维度"},
            {"table_name": "dwd_learning_activity_df", "comment": "学习行为明细"},
            {"table_name": "dws_student_activity_di", "comment": "学生活跃汇总"},
        ]
    }
    schema_by_table = {
        "dim_school_df": _schema(
            "dim_school_df",
            _columns(
                ("school_id", "string", "学校ID"),
                ("school_name", "string", "学校名称"),
                ("ds", "string", "分区日期", True),
            ),
        ),
        "dwd_learning_activity_df": _schema(
            "dwd_learning_activity_df",
            _columns(
                ("activity_id", "string", "行为ID"),
                ("student_id", "string", "学生ID"),
                ("activity_time", "datetime", "行为时间"),
                ("duration_sec", "bigint", "学习时长"),
                ("ds", "string", "分区日期", True),
            ),
        ),
        "dws_student_activity_di": _schema(
            "dws_student_activity_di",
            _columns(
                ("ds", "string", "统计日期", True),
                ("student_id", "string", "学生ID"),
                ("active_days", "bigint", "活跃天数"),
                ("activity_count", "bigint", "学习次数"),
            ),
        ),
    }
    scanner, cache, adapter = _make_scanner(tables_by_db, schema_by_table)

    packages = scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")

    by_source = {p.source: p for p in packages}
    assert by_source["dim_school_df"].package_type == "dimension"
    assert by_source["dwd_learning_activity_df"].package_type == "fact"
    assert by_source["dws_student_activity_di"].package_type == "metric"

    # 列快照写入 modeling_source，保证离线进入 Copilot
    snapshot = by_source["dwd_learning_activity_df"].modeling_source["evidence_bundle"]["schema_snapshot"]
    assert [c["name"] for c in snapshot["columns"]] == [
        "activity_id",
        "student_id",
        "activity_time",
        "duration_sec",
        "ds",
    ]
    assert snapshot["partitions"] == ["ds"]
    assert snapshot["snapshot_id"] == "scan:7:dw:dwd_learning_activity_df"

    # adapter 在扫描结束后被关闭
    assert adapter.closed is True
    # 真实表缓存被读取
    assert cache.calls and cache.calls[0][1] == "dw"


def test_scan_respects_max_tables():
    tables = [{"table_name": f"dwd_t{i}_df", "comment": f"表{i}"} for i in range(5)]
    schema_by_table = {
        t["table_name"]: _schema(
            t["table_name"],
            _columns(("id", "string", "主键"), ("amount", "bigint", "金额")),
        )
        for t in tables
    }
    scanner, _cache, _adapter = _make_scanner({"dw": tables}, schema_by_table)

    packages = scanner.scan(
        _project({"source_id": 7, "database": "dw", "max_tables": 2}), "balanced"
    )
    assert len(packages) == 2


def test_scan_empty_cache_returns_empty():
    scanner, _cache, _adapter = _make_scanner({"dw": []}, {})
    packages = scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")
    assert packages == []


def test_scan_skips_table_on_schema_failure():
    tables = [
        {"table_name": "dwd_ok_df", "comment": "可用"},
        {"table_name": "dwd_bad_df", "comment": "失败"},
    ]
    schema_by_table = {
        "dwd_ok_df": _schema(
            "dwd_ok_df", _columns(("id", "string", "主键"), ("amount", "bigint", "金额"))
        ),
    }
    scanner, _cache, _adapter = _make_scanner(
        {"dw": tables}, schema_by_table, failing={"dwd_bad_df"}
    )

    packages = scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")
    assert [p.source for p in packages] == ["dwd_ok_df"]


def test_scan_metric_without_measure_needs_scope():
    tables = [{"table_name": "dws_student_profile_df", "comment": "学生画像汇总"}]
    schema_by_table = {
        "dws_student_profile_df": _schema(
            "dws_student_profile_df",
            _columns(
                ("student_id", "string", "学生ID"),
                ("student_name", "string", "学生姓名"),
                ("grade_level", "string", "年级"),
            ),
        ),
    }
    scanner, _cache, _adapter = _make_scanner({"dw": tables}, schema_by_table)

    packages = scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")
    assert len(packages) == 1
    metric_pkg = packages[0]
    assert metric_pkg.package_type == "metric"
    assert metric_pkg.cube_suggestions.get("measures") == []
    assert metric_pkg.status == "needs_scope"


def test_scan_allowlist_selects_specific_tables():
    tables = [
        {"table_name": "dim_school_df", "comment": "学校"},
        {"table_name": "dim_class_df", "comment": "班级"},
    ]
    schema_by_table = {
        "dim_school_df": _schema("dim_school_df", _columns(("school_id", "string", "学校ID"))),
        "dim_class_df": _schema("dim_class_df", _columns(("class_id", "string", "班级ID"))),
    }
    scanner, _cache, _adapter = _make_scanner({"dw": tables}, schema_by_table)

    packages = scanner.scan(
        _project(
            {"source_id": 7, "database": "dw", "table_allowlist": ["dim_class_df"]}
        ),
        "balanced",
    )
    assert [p.source for p in packages] == ["dim_class_df"]


def test_scan_falls_back_to_all_tables_when_no_prefix_match():
    tables = [
        {"table_name": "weird_table_one", "comment": "无规范命名"},
        {"table_name": "weird_table_two", "comment": "无规范命名"},
    ]
    schema_by_table = {
        "weird_table_one": _schema(
            "weird_table_one", _columns(("id", "string", "主键"), ("amount", "bigint", "金额"))
        ),
        "weird_table_two": _schema(
            "weird_table_two", _columns(("id", "string", "主键"))
        ),
    }
    scanner, _cache, _adapter = _make_scanner({"dw": tables}, schema_by_table)

    packages = scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")
    assert {p.source for p in packages} == {"weird_table_one", "weird_table_two"}
    # 无规范命名时默认归为 fact
    assert all(p.package_type == "fact" for p in packages)


def test_scan_confidence_higher_with_complete_comments():
    well_commented = [{"table_name": "dwd_rich_df", "comment": "完整"}]
    sparse = [{"table_name": "dwd_sparse_df", "comment": ""}]
    rich_schema = {
        "dwd_rich_df": _schema(
            "dwd_rich_df",
            _columns(
                ("order_id", "string", "订单ID"),
                ("amount", "bigint", "金额"),
                ("created_at", "datetime", "创建时间"),
            ),
        )
    }
    sparse_schema = {
        "dwd_sparse_df": _schema(
            "dwd_sparse_df",
            _columns(("c1", "string", ""), ("c2", "string", ""), ("c3", "string", "")),
        )
    }
    rich_scanner, _c1, _a1 = _make_scanner({"dw": well_commented}, rich_schema)
    sparse_scanner, _c2, _a2 = _make_scanner({"dw": sparse}, sparse_schema)

    rich = rich_scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")[0]
    poor = sparse_scanner.scan(_project({"source_id": 7, "database": "dw"}), "balanced")[0]

    assert rich.confidence > poor.confidence
