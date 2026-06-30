"""Phase 1.3 — JoinGraph + Compiler 单元测试

覆盖 PRD 6.11 测试用例矩阵中的核心场景"""
import types
from datetime import date

import pytest

from app.domain.semantic.compiler import (
    CompilationError,
    CompileResult,
    QueryCompiler,
    UnknownCubeError,
    UnknownFieldError,
)
from app.domain.semantic.dialects import MaxComputeDialect
from app.domain.semantic.entities import (
    CubeDefinition,
    DimensionDef,
    JoinDef,
    MeasureDef,
    PartitionDef,
    QueryDSL,
    DefaultFilterDef,
    SegmentDef,
    FilterDef,
    TimeDimensionDef,
)
from app.domain.semantic.join_graph import (
    JoinGraph,
    JoinPathNotFoundError,
    JoinPathTooDeepError,
)


# ── 测试用 Cube 工厂 ──

def _make_cube(
    name: str,
    table: str,
    dims: dict | None = None,
    measures: dict | None = None,
    joins: dict | None = None,
    partition: PartitionDef | None = None,
    default_filters: list | None = None,
    segments: dict | None = None,
) -> CubeDefinition:
    return CubeDefinition(
        name=name,
        title=name,
        table=table,
        partition=partition,
        default_filters=default_filters or [],
        dimensions=dims or {"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
        measures=measures or {"cnt": MeasureDef(title="Count", type="count", sql="{CUBE}.id")},
        joins=joins or {},
        segments=segments or {},
    )


STUDENT = _make_cube(
    "student", "dim_student",
    dims={
        "user_id": DimensionDef(title="用户ID", type="string", sql="{CUBE}.user_id", primary_key=True),
        "user_name": DimensionDef(title="用户名", type="string", sql="{CUBE}.user_name"),
        "user_is_test": DimensionDef(title="是否测试", type="number", sql="{CUBE}.user_is_test"),
    },
    measures={
        "student_total": MeasureDef(title="学生总数", type="count", sql="{CUBE}.user_id"),
    },
    default_filters=[DefaultFilterDef(sql="user_is_test = 1")],
)

SCHOOL = _make_cube(
    "school", "dim_school",
    dims={
        "school_id": DimensionDef(title="学校ID", type="string", sql="{CUBE}.school_id", primary_key=True),
        "school_name": DimensionDef(title="学校名称", type="string", sql="{CUBE}.school_name"),
    },
    measures={
        "school_total": MeasureDef(title="学校总数", type="count", sql="{CUBE}.school_id"),
    },
)

ANSWER = _make_cube(
    "answer_records", "dwd_answer",
    dims={
        "answer_record_id": DimensionDef(title="答题记录ID", type="string", sql="{CUBE}.answer_record_id", primary_key=True),
        "subject_name": DimensionDef(title="学科名称", type="string", sql="{CUBE}.subject_name"),
        "answer_date": DimensionDef(title="答题日期", type="string", sql="{CUBE}.answer_date"),
        "answer_result": DimensionDef(title="答题结果", type="number", sql="{CUBE}.answer_result"),
        "student_id": DimensionDef(title="学生ID", type="string", sql="{CUBE}.student_id"),
    },
    measures={
        "total_count": MeasureDef(title="答题数", type="count", sql="{CUBE}.answer_record_id"),
        "correct_count": MeasureDef(title="正确数", type="sum", sql="CASE WHEN {CUBE}.answer_result = 1 THEN 1 ELSE 0 END"),
        "accuracy": MeasureDef(title="正确率", type="number", sql="ROUND({correct_count} * 100.0 / NULLIF({total_count}, 0), 2)"),
    },
    joins={
        "student": JoinDef(cube="student", type="left", sql="{CUBE}.student_id = {student}.user_id"),
    },
    partition=PartitionDef(field="answer_date", format="yyyyMMdd"),
    segments={
        "only_correct": SegmentDef(title="仅正确", sql="{CUBE}.answer_result = 1"),
    },
)


@pytest.fixture
def graph():
    return JoinGraph([ANSWER, STUDENT, SCHOOL])


@pytest.fixture
def compiler(graph):
    return QueryCompiler(graph, dialect=MaxComputeDialect())


# ── JoinGraph 测试 ──

class TestJoinGraph:

    def test_direct_join(self, graph):
        edges = graph.find_path("answer_records", "student")
        assert len(edges) == 1
        assert edges[0].target == "student"

    def test_self_join_is_empty(self, graph):
        assert graph.find_path("student", "student") == []

    def test_no_path_raises(self, graph):
        with pytest.raises(JoinPathNotFoundError):
            graph.find_path("student", "school")

    def test_resolve_multi_cube(self, graph):
        edges = graph.resolve_join_paths({"answer_records", "student"})
        targets = [e.target for e in edges]
        assert "student" in targets

    def test_deep_path_raises(self):
        """超过 MAX_JOIN_DEPTH=3 应报错"""
        cubes = []
        for i in range(5):
            name = f"cube_{i}"
            joins = {}
            if i < 4:
                joins["next"] = JoinDef(cube=f"cube_{i+1}", type="left", sql=f"{{CUBE}}.id = {{cube_{i+1}}}.id")
            cubes.append(_make_cube(name, f"table_{i}", joins=joins))
        g = JoinGraph(cubes)
        with pytest.raises(JoinPathTooDeepError):
            g.find_path("cube_0", "cube_4")

    def test_helper_paths_cover_single_waypoint_direct_edge_depth_and_visited_skip(self, graph):
        assert graph.resolve_join_paths({"student"}) == []
        assert graph.find_path_through(["student"]) == []
        assert graph._find_direct_edge("student", "school") is None
        assert graph.get_cube("student").name == "student"

        with pytest.raises(JoinPathNotFoundError):
            graph.find_path_through(["answer_records", "school"])

        cubes = []
        for i in range(5):
            name = f"path_cube_{i}"
            joins = {}
            if i < 4:
                joins["next"] = JoinDef(cube=f"path_cube_{i+1}", type="left", sql=f"{{CUBE}}.id = {{path_cube_{i+1}}}.id")
            cubes.append(_make_cube(name, f"path_table_{i}", joins=joins))
        deep_graph = JoinGraph(cubes)
        with pytest.raises(JoinPathTooDeepError):
            deep_graph.find_path_through([cube.name for cube in cubes])

        mid = _make_cube(
            "mid",
            "dim_mid",
            joins={"leaf": JoinDef(cube="leaf", type="left", sql="{CUBE}.id = {leaf}.id")},
        )
        left = _make_cube(
            "left",
            "dim_left",
            joins={"mid": JoinDef(cube="mid", type="left", sql="{CUBE}.id = {mid}.id")},
        )
        right = _make_cube(
            "right",
            "dim_right",
            joins={"mid": JoinDef(cube="mid", type="left", sql="{CUBE}.id = {mid}.id")},
        )
        root = _make_cube(
            "root",
            "dim_root",
            joins={
                "left": JoinDef(cube="left", type="left", sql="{CUBE}.id = {left}.id"),
                "right": JoinDef(cube="right", type="left", sql="{CUBE}.id = {right}.id"),
            },
        )
        leaf = _make_cube("leaf", "dim_leaf")
        ambiguous_graph = JoinGraph([root, left, right, mid, leaf])
        path = ambiguous_graph.find_path("root", "leaf")
        assert [edge.target for edge in path] == ["left", "mid", "leaf"]


# ── Compiler 基础测试 ──

class TestCompilerBasic:

    def test_query_dsl_carries_runtime_contract_version(self):
        dsl = QueryDSL(measures=["answer_records.total_count"])

        assert dsl.dsl_version == "v1"
        assert dsl.model_dump(mode="json", exclude_none=True)["dsl_version"] == "v1"

    def test_single_cube_simple_count(self, compiler):
        """TC-01: 单 Cube 单指标"""
        dsl = QueryDSL(measures=["answer_records.total_count"])
        result = compiler.compile(dsl)
        assert "COUNT(answer_records.answer_record_id)" in result.sql
        assert result.primary_cube == "answer_records"
        assert "LIMIT" in result.sql

    def test_measure_sql_with_aggregate_not_double_wrapped(self):
        """回归：Agent 生成的 measure.sql 已含聚合时不再叠加聚合（COUNT(COUNT(..))）。"""
        cube = _make_cube(
            "comment_reports", "dwd.comment_reports",
            measures={
                "total_count": MeasureDef(title="总数", type="count", sql="COUNT({CUBE}.comment_id)"),
                "uv": MeasureDef(title="去重数", type="count_distinct", sql="count(distinct {CUBE}.student_id)"),
            },
        )
        compiler = QueryCompiler(JoinGraph([cube]))
        result = compiler.compile(QueryDSL(measures=["comment_reports.total_count", "comment_reports.uv"]))
        assert "COUNT(COUNT(" not in result.sql.upper().replace(" ", "")
        assert "COUNT(comment_reports.comment_id)" in result.sql
        assert "count(distinct comment_reports.student_id)" in result.sql

    def test_dimension_and_measure(self, compiler):
        """TC-02: 单 Cube 维度+指标"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            dimensions=["answer_records.subject_name"],
        )
        result = compiler.compile(dsl)
        assert "answer_records.subject_name" in result.sql

    def test_restricted_dimension_cannot_be_selected(self):
        cube = _make_cube(
            "student_comment_cube",
            "dwd.student_comment",
            dims={
                "comment_id": DimensionDef(title="评论ID", type="string", sql="{CUBE}.comment_id"),
                "comment_content": DimensionDef(
                    title="评论内容",
                    type="string",
                    sql="{CUBE}.comment_content",
                    tags=["restricted"],
                ),
            },
            measures={
                "comment_count": MeasureDef(title="评论数", type="count", sql="{CUBE}.comment_id"),
            },
        )
        compiler = QueryCompiler(JoinGraph([cube]))

        with pytest.raises(CompilationError, match="restricted"):
            compiler.compile(
                QueryDSL(
                    measures=["student_comment_cube.comment_count"],
                    dimensions=["student_comment_cube.comment_content"],
                )
            )

    def test_source_relation_trims_source_sql_trailing_semicolon(self, compiler):
        cube = _make_cube("source_cube", "ods.source_cube").model_copy(
            update={"source_sql": "SELECT * FROM ods.source_cube;   "}
        )

        assert compiler._source_relation(cube) == "(\nSELECT * FROM ods.source_cube\n)"
        assert compiler._source_relation(_make_cube("table_cube", "ods.table_cube")) == "ods.table_cube"

        result = QueryCompiler(JoinGraph([cube])).compile(
            QueryDSL(measures=["source_cube.cnt"])
        )
        assert "FROM (\nSELECT * FROM ods.source_cube\n) AS source_cube" in result.sql

    def test_filter_equals(self, compiler):
        """TC-05: 等值过滤"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="answer_records.subject_name", operator="equals", values=["数学"])],
        )
        result = compiler.compile(dsl)
        assert "answer_records.subject_name = '数学'" in result.sql

    def test_filter_in(self, compiler):
        """多值 IN 过滤"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="answer_records.subject_name", operator="equals", values=["数学", "英语"])],
        )
        result = compiler.compile(dsl)
        assert "IN" in result.sql

    def test_filter_contains(self, compiler):
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="answer_records.subject_name", operator="contains", values=["数"])],
        )
        result = compiler.compile(dsl)
        assert "LIKE '%数%'" in result.sql

    def test_filter_set_notset(self, compiler):
        dsl_set = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="answer_records.subject_name", operator="set", values=[])],
        )
        assert "IS NOT NULL" in compiler.compile(dsl_set).sql

        dsl_notset = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="answer_records.subject_name", operator="notSet", values=[])],
        )
        assert "IS NULL" in compiler.compile(dsl_notset).sql

    def test_segment(self, compiler):
        """TC-06: segment 应用"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            segments=["answer_records.only_correct"],
        )
        result = compiler.compile(dsl)
        assert "answer_result = 1" in result.sql

    def test_order_and_limit(self, compiler):
        """TC-07: 排序与限制"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            dimensions=["answer_records.subject_name"],
            order=[["answer_records.total_count", "desc"]],
            limit=100,
        )
        result = compiler.compile(dsl)
        assert "ORDER BY" in result.sql
        assert "DESC" in result.sql
        assert "LIMIT 100" in result.sql

    def test_default_filter_injected(self, compiler):
        """TC-08: 主 Cube 过滤进 WHERE，关联 Cube 过滤进 ON"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="student.user_name", operator="equals", values=["张三"])],
        )
        result = compiler.compile(dsl)
        assert "student.user_is_test = 1" in result.sql
        join_section = result.sql.split("WHERE")[0]
        where_section = result.sql.split("WHERE")[1]
        assert "student.user_is_test = 1" in join_section
        assert "student.user_is_test = 1" not in where_section
        assert "answer_records.answer_result = 1" not in result.sql


# ── Compiler 跨表 JOIN 测试 ──

class TestCompilerJoin:

    def test_cross_cube_join(self, compiler):
        """TC-03: 跨 Cube JOIN"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            dimensions=["answer_records.subject_name"],
            filters=[FilterDef(dimension="student.user_name", operator="equals", values=["倪佳俊"])],
        )
        result = compiler.compile(dsl)
        assert "LEFT JOIN" in result.sql
        assert "dim_student student" in result.sql
        assert "student" in result.joined_cubes

    def test_scoped_table_refs_emit_from_and_join_anchors(self, compiler):
        """row_scope 注入锚点：主表 from + 关联表 join"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="student.user_name", operator="equals", values=["倪佳俊"])],
        )
        result = compiler.compile(dsl)
        assert {"table": "dwd_answer", "alias": "answer_records", "scan_anchor": "from"} in result.scoped_table_refs
        assert {"table": "dim_student", "alias": "student", "scan_anchor": "join"} in result.scoped_table_refs

    def test_scoped_table_refs_single_cube_only_from_anchor(self, compiler):
        dsl = QueryDSL(measures=["answer_records.total_count"])
        result = compiler.compile(dsl)
        assert result.scoped_table_refs == [
            {"table": "dwd_answer", "alias": "answer_records", "scan_anchor": "from"}
        ]

    def test_join_placeholder_uses_edge_source(self):
        leaf = _make_cube(
            "school_leaf",
            "dim_school_leaf",
            dims={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        )
        student = _make_cube(
            "student_bridge",
            "dim_student_bridge",
            dims={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True)},
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
            joins={
                "school_leaf": JoinDef(
                    cube="school_leaf",
                    type="left",
                    sql="{CUBE}.school_id = {school_leaf}.id",
                )
            },
        )
        answer = _make_cube(
            "answer_bridge",
            "fact_answer_bridge",
            dims={
                "id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True),
                "student_id": DimensionDef(title="学生ID", type="string", sql="{CUBE}.student_id"),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
            joins={
                "student_bridge": JoinDef(
                    cube="student_bridge",
                    type="left",
                    sql="{CUBE}.student_id = {student_bridge}.id",
                )
            },
        )
        compiler = QueryCompiler(JoinGraph([answer, student, leaf]), dialect=MaxComputeDialect())
        dsl = QueryDSL(
            measures=["answer_bridge.cnt"],
            dimensions=["school_leaf.id"],
            join_path=["answer_bridge", "student_bridge", "school_leaf"],
        )
        result = compiler.compile(dsl)
        assert "student_bridge.school_id = school_leaf.id" in result.sql


# ── Compiler 时间维度 ──

class TestCompilerTimeDimension:

    def test_time_dimension_with_range(self, compiler):
        """TC-04: 分区时间范围"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            time_dimensions=[TimeDimensionDef(
                dimension="answer_records.answer_date",
                date_range=["2026-02-21", "2026-02-27"],
            )],
        )
        result = compiler.compile(dsl)
        assert "answer_date >= '20260221'" in result.sql
        assert "answer_date <= '20260227'" in result.sql
        assert "answer_records.answer_date AS `answer_records__answer_date`" not in result.sql
        assert "GROUP BY `answer_records__answer_date`" not in result.sql

    def test_time_granularity_day(self, compiler):
        """TC-10: 日粒度"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            time_dimensions=[TimeDimensionDef(
                dimension="answer_records.answer_date",
                granularity="day",
                date_range=["2026-02-21", "2026-02-27"],
            )],
        )
        result = compiler.compile(dsl)
        assert "answer_date__day" in result.sql

    def test_time_granularity_month(self, compiler):
        """TC-11: 月粒度"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            time_dimensions=[TimeDimensionDef(
                dimension="answer_records.answer_date",
                granularity="month",
                date_range=["2026-01-01", "2026-02-28"],
            )],
        )
        result = compiler.compile(dsl)
        assert "SUBSTR" in result.sql

    def test_time_range_exceeds_partition_limit(self, compiler):
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            time_dimensions=[TimeDimensionDef(
                dimension="answer_records.answer_date",
                date_range=["2026-01-01", "2026-05-01"],
            )],
        )
        with pytest.raises(CompilationError, match="max_range_days"):
            compiler.compile(dsl)


# ── Compiler 计算指标 ──

class TestCompilerDerivedMeasures:

    def test_derived_measure_expansion(self, compiler):
        """TC-09: accuracy = f(correct_count, total_count) 递归展开"""
        dsl = QueryDSL(
            measures=["answer_records.accuracy"],
            dimensions=["answer_records.subject_name"],
        )
        result = compiler.compile(dsl)
        assert "COUNT" in result.sql
        assert "SUM" in result.sql
        assert "NULLIF" in result.sql

    def test_latest_partition_fallback(self):
        """Phase 10 翻转：latest_expr 空的 date 型分区 cube + 无显式过滤
        → 注入默认 7 天窗口范围谓词（绝不注 MAX_PT）。

        固定时钟 today=date(2026, 6, 26)，ANSWER max_range_days=90 → win=7
        → start=20260620, end=20260626。本波仍为 RED（compiler 尚未实现注入）。
        """
        compiler = QueryCompiler(
            JoinGraph([ANSWER, STUDENT, SCHOOL]),
            dialect=MaxComputeDialect(),
            today=date(2026, 6, 26),
        )
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
        )
        result = compiler.compile(dsl)
        # latest_expr 空 → 走范围谓词，绝不注 MAX_PT
        assert "MAX_PT" not in result.sql
        # 已注入默认 7 天窗口
        assert "answer_records.answer_date >= '20260620'" in result.sql
        assert "answer_records.answer_date <= '20260626'" in result.sql


# ── Compiler 错误处理 ──

class TestCompilerErrors:

    def test_unknown_cube(self, compiler):
        dsl = QueryDSL(measures=["nonexistent.total_count"])
        with pytest.raises(UnknownCubeError):
            compiler.compile(dsl)

    def test_unknown_dimension(self, compiler):
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            filters=[FilterDef(dimension="answer_records.no_such_dim", operator="equals", values=["x"])],
        )
        with pytest.raises(UnknownFieldError):
            compiler.compile(dsl)

    def test_unknown_measure(self, compiler):
        dsl = QueryDSL(measures=["answer_records.no_such_measure"])
        with pytest.raises(UnknownFieldError):
            compiler.compile(dsl)

    def test_empty_dsl_raises(self, compiler):
        dsl = QueryDSL()
        with pytest.raises(CompilationError):
            compiler.compile(dsl)

    def test_unknown_segment(self, compiler):
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            segments=["answer_records.nonexistent_seg"],
        )
        with pytest.raises(UnknownFieldError):
            compiler.compile(dsl)

    def test_reject_one_to_many_join_for_measure_query(self):
        root = _make_cube(
            "orders",
            "fact_orders",
            dims={
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id", primary_key=True),
                "user_id": DimensionDef(title="用户ID", type="string", sql="{CUBE}.user_id"),
            },
            measures={"order_count": MeasureDef(title="订单数", type="count", sql="{CUBE}.order_id")},
            joins={
                "order_items": JoinDef(
                    cube="order_items",
                    type="left",
                    relationship="1:N",
                    sql="{CUBE}.order_id = {order_items}.order_id",
                )
            },
        )
        child = _make_cube(
            "order_items",
            "fact_order_items",
            dims={"order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id", primary_key=True)},
            measures={"item_count": MeasureDef(title="明细数", type="count", sql="{CUBE}.order_id")},
        )
        compiler = QueryCompiler(JoinGraph([root, child]), dialect=MaxComputeDialect())
        dsl = QueryDSL(
            measures=["orders.order_count"],
            dimensions=["order_items.order_id"],
        )
        with pytest.raises(CompilationError, match="not supported"):
            compiler.compile(dsl)

    def test_reject_non_additive_measure_with_grouping(self):
        cube = _make_cube(
            "snapshot_orders",
            "snapshot_orders",
            dims={
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id", primary_key=True),
                "ds": DimensionDef(title="分区日", type="time", sql="{CUBE}.ds"),
            },
            measures={
                "inventory": MeasureDef(
                    title="库存",
                    type="sum",
                    sql="{CUBE}.inventory",
                    non_additive=True,
                )
            },
        )
        compiler = QueryCompiler(JoinGraph([cube]), dialect=MaxComputeDialect())
        dsl = QueryDSL(
            measures=["snapshot_orders.inventory"],
            dimensions=["snapshot_orders.ds"],
        )
        with pytest.raises(CompilationError, match="non_additive"):
            compiler.compile(dsl)

    def test_reject_invalid_grain_contract_at_compile_time(self):
        cube = _make_cube(
            "orders_contract",
            "fact_orders_contract",
            dims={
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id", primary_key=True),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.order_id")},
        )
        cube.grain = "missing_dimension"
        compiler = QueryCompiler(JoinGraph([cube]), dialect=MaxComputeDialect())
        with pytest.raises(CompilationError, match="grain='missing_dimension'"):
            compiler.compile(QueryDSL(measures=["orders_contract.cnt"]))

    def test_helper_paths_cover_dimension_only_filters_dates_and_measure_variants(self, compiler):
        dsl = QueryDSL(dimensions=["answer_records.subject_name"], limit=10)
        result = compiler.compile(dsl)
        assert result.primary_cube == "answer_records"
        assert "GROUP BY" in result.sql

        numeric_filter_sql = compiler.compile(
            QueryDSL(
                measures=["answer_records.total_count"],
                filters=[FilterDef(dimension="answer_records.answer_result", operator="equals", values=[1])],
            )
        ).sql
        assert "answer_records.answer_result = 1" in numeric_filter_sql

        non_partition_range_sql = compiler.compile(
            QueryDSL(
                measures=["answer_records.total_count"],
                time_dimensions=[TimeDimensionDef(
                    dimension="student.user_name",
                    date_range=["2026-02-21", "2026-02-27"],
                )],
            )
        ).sql
        assert "student.user_name >= '2026-02-21'" in non_partition_range_sql
        assert "student.user_name <= '2026-02-27'" in non_partition_range_sql

        with pytest.raises(CompilationError, match="expected 'cube.field'"):
            compiler._parse_ref("broken")

        assert compiler._resolve_col("status = 1 AND student.user_id = 2", "answer_records") == (
            "answer_records.status = 1 AND student.user_id = 2"
        )

        time_lax_cube = _make_cube(
            "time_lax",
            "fact_time_lax",
            partition=PartitionDef(field="ds", format="yyyyMMdd", max_range_days=0),
        )
        QueryCompiler(JoinGraph([time_lax_cube]), dialect=MaxComputeDialect())._validate_time_range(
            time_lax_cube,
            ["2026-01-01"],
        )

        invalid_date_cube = _make_cube(
            "invalid_date_cube",
            "fact_invalid_date",
            partition=PartitionDef(field="ds", format="yyyyMMdd", max_range_days=7),
        )
        invalid_date_compiler = QueryCompiler(JoinGraph([invalid_date_cube]), dialect=MaxComputeDialect())
        with pytest.raises(CompilationError, match="expected YYYY-MM-DD"):
            invalid_date_compiler._validate_time_range(invalid_date_cube, ["2026/01/01", "2026-01-02"])
        with pytest.raises(CompilationError, match="earlier than start date"):
            invalid_date_compiler._validate_time_range(invalid_date_cube, ["2026-01-03", "2026-01-02"])

        metric_cube = _make_cube(
            "metric_cube",
            "fact_metric_cube",
            measures={
                "distinct_users": MeasureDef(title="去重用户", type="count_distinct", sql="{CUBE}.user_id"),
                "avg_score": MeasureDef(title="平均分", type="avg", sql="{CUBE}.score"),
                "min_score": MeasureDef(title="最低分", type="min", sql="{CUBE}.score"),
                "max_score": MeasureDef(title="最高分", type="max", sql="{CUBE}.score"),
                "raw_metric": MeasureDef(title="原值", type="number", sql="{CUBE}.score"),
            },
        )
        metric_cube.measures["broken_metric"] = types.SimpleNamespace(type="median", sql="{CUBE}.score")
        metric_compiler = QueryCompiler(JoinGraph([metric_cube]), dialect=MaxComputeDialect())
        metric_cubes = {"metric_cube": metric_cube}

        assert metric_compiler._resolve_measure_expr("metric_cube.distinct_users", metric_cubes) == "COUNT(DISTINCT metric_cube.user_id)"
        assert metric_compiler._resolve_measure_expr("metric_cube.avg_score", metric_cubes) == "AVG(metric_cube.score)"
        assert metric_compiler._resolve_measure_expr("metric_cube.min_score", metric_cubes) == "MIN(metric_cube.score)"
        assert metric_compiler._resolve_measure_expr("metric_cube.max_score", metric_cubes) == "MAX(metric_cube.score)"
        assert metric_compiler._resolve_measure_expr("metric_cube.raw_metric", metric_cubes) == "metric_cube.score"
        with pytest.raises(CompilationError, match="Unsupported measure type"):
            metric_compiler._resolve_measure_expr("metric_cube.broken_metric", metric_cubes)

        contract_cube = _make_cube("contract_cube", "fact_contract_cube")
        contract_cube.entity_key = "missing_entity"
        contract_compiler = QueryCompiler(JoinGraph([contract_cube]), dialect=MaxComputeDialect())
        with pytest.raises(CompilationError, match="entity_key='missing_entity'"):
            contract_compiler.compile(QueryDSL(measures=["contract_cube.cnt"]))

    def test_helper_paths_cover_unknown_operator_latest_partition_edge_loading_and_wrap_agg(self, compiler):
        with pytest.raises(CompilationError, match="Unknown filter operator"):
            compiler.compile(
                QueryDSL(
                    measures=["answer_records.total_count"],
                    filters=[FilterDef(dimension="answer_records.subject_name", operator="weird", values=["x"])],
                )
            )

        latest_cube = _make_cube(
            "latest_orders",
            "fact_latest_orders",
            partition=PartitionDef(field="ds", format="yyyyMMdd", latest_expr="MAX_PT('fact_latest_orders')"),
        )
        latest_compiler = QueryCompiler(JoinGraph([latest_cube]), dialect=MaxComputeDialect())
        latest_sql = latest_compiler.compile(QueryDSL(measures=["latest_orders.cnt"])).sql
        assert "latest_orders.ds = MAX_PT('fact_latest_orders')" in latest_sql

        ghost_edge = JoinDef(cube="ghost", type="left", sql="{CUBE}.student_id = {ghost}.id")
        with pytest.raises(UnknownCubeError):
            QueryCompiler(JoinGraph([ANSWER]), dialect=MaxComputeDialect())._ensure_edge_cubes_loaded(
                [type("Edge", (), {"source": "answer_records", "target": "ghost", "join_def": ghost_edge})()],
                {"answer_records": ANSWER},
            )

        assert compiler._wrap_agg("count_distinct", "score") == "COUNT(DISTINCT score)"
        assert compiler._wrap_agg("avg", "score") == "AVG(score)"
        assert compiler._wrap_agg("min", "score") == "MIN(score)"
        assert compiler._wrap_agg("max", "score") == "MAX(score)"
        assert compiler._wrap_agg("unknown", "score") == "score"


# ── Compiler 默认分区注入（Phase 10 RED） ──

class TestCompilerDefaultPartitionInjection:
    """Phase 10 RED：date 型分区 cube（latest_expr 空）+ 无显式时间过滤
    → 应注入默认最近 7 天窗口范围谓词，绕开 MaxCompute 全表扫描保护。

    固定时钟 today=date(2026, 6, 26)，窗口算法 D2：
      win = min(7, max(max_range_days - 1, 1))；end = today；start = today - (win - 1)
      ANSWER max_range_days=90 → win=7 → start=20260620, end=20260626（含两端 7 天）。

    本波全部用例应为 RED（compiler 尚未实现注入 / today= 触发 TypeError）。
    """

    def _make_compiler(self, cubes):
        return QueryCompiler(
            JoinGraph(cubes),
            dialect=MaxComputeDialect(),
            today=date(2026, 6, 26),
        )

    def test_a_date_partition_no_filter_injects_default_window(self):
        """Test A：date 型分区无过滤 → 注入默认 7 天窗口范围谓词。"""
        compiler = self._make_compiler([ANSWER, STUDENT, SCHOOL])
        result = compiler.compile(QueryDSL(measures=["answer_records.total_count"]))
        assert "answer_records.answer_date >= '20260620'" in result.sql
        assert "answer_records.answer_date <= '20260626'" in result.sql

    def test_b_explicit_filter_on_partition_field_skips_default(self):
        """Test B：显式 filters 命中分区字段 → 不注入默认（守护 D3），保留用户过滤。"""
        compiler = self._make_compiler([ANSWER, STUDENT, SCHOOL])
        result = compiler.compile(
            QueryDSL(
                measures=["answer_records.total_count"],
                filters=[
                    FilterDef(
                        dimension="answer_records.answer_date",
                        operator="gte",
                        values=["20260101"],
                    )
                ],
            )
        )
        assert "'20260620'" not in result.sql
        assert "answer_records.answer_date >= '20260101'" in result.sql

    def test_c_explicit_time_dimension_range_skips_default(self):
        """Test C：显式 time_dimensions date_range 命中分区字段 → 不注入默认（守护 D3）。"""
        compiler = self._make_compiler([ANSWER, STUDENT, SCHOOL])
        result = compiler.compile(
            QueryDSL(
                measures=["answer_records.total_count"],
                time_dimensions=[
                    TimeDimensionDef(
                        dimension="answer_records.answer_date",
                        date_range=["2026-02-21", "2026-02-27"],
                    )
                ],
            )
        )
        assert "answer_date >= '20260221'" in result.sql
        assert "answer_date <= '20260227'" in result.sql
        assert "'20260620'" not in result.sql

    def test_d_string_partition_not_injected(self):
        """Test D：非 date 型分区（type="string"）不注入默认窗口、不注 MAX_PT。"""
        string_cube = _make_cube(
            "string_part_cube",
            "fact_string_part",
            dims={
                "id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True),
                "ds": DimensionDef(title="分区日", type="string", sql="{CUBE}.ds"),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
            partition=PartitionDef(field="ds", type="string", format="yyyyMMdd"),
        )
        compiler = self._make_compiler([string_cube])
        result = compiler.compile(QueryDSL(measures=["string_part_cube.cnt"]))
        assert "'20260620'" not in result.sql
        assert "MAX_PT" not in result.sql

    def test_e_source_sql_cube_not_injected(self):
        """Test E：source_sql 派生 cube 不注入默认窗口。"""
        source_cube = _make_cube(
            "src_part_cube",
            "fact_src_part",
            dims={
                "id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True),
                "answer_date": DimensionDef(title="答题日期", type="string", sql="{CUBE}.answer_date"),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
        ).model_copy(
            update={
                "source_sql": "SELECT * FROM t",
                "partition": PartitionDef(field="answer_date", type="date", format="yyyyMMdd"),
            }
        )
        compiler = self._make_compiler([source_cube])
        result = compiler.compile(QueryDSL(measures=["src_part_cube.cnt"]))
        assert "'20260620'" not in result.sql
        assert "'20260626'" not in result.sql

    def test_f_latest_expr_still_uses_max_pt(self):
        """Test F：latest_expr 非空仍走 MAX_PT（契约不变，优先级高于默认窗口）。"""
        latest_cube = _make_cube(
            "latest_part_cube",
            "fact_latest_part",
            dims={
                "id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True),
                "ds": DimensionDef(title="分区日", type="string", sql="{CUBE}.ds"),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
            partition=PartitionDef(field="ds", format="yyyyMMdd", latest_expr="MAX_PT('fact_latest')"),
        )
        compiler = self._make_compiler([latest_cube])
        result = compiler.compile(QueryDSL(measures=["latest_part_cube.cnt"]))
        assert "ds = MAX_PT('fact_latest')" in result.sql
        assert "'20260620'" not in result.sql

    def test_g_unknown_format_raises_compilation_error(self):
        """Test G：未知 format → CompilationError（D5 确定性兜底，禁止静默产错字面量）。"""
        weird_cube = _make_cube(
            "weird_fmt_cube",
            "fact_weird_fmt",
            dims={
                "id": DimensionDef(title="ID", type="string", sql="{CUBE}.id", primary_key=True),
                "ds": DimensionDef(title="分区日", type="string", sql="{CUBE}.ds"),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.id")},
            partition=PartitionDef(field="ds", type="date", format="weird-fmt"),
        )
        compiler = self._make_compiler([weird_cube])
        with pytest.raises(CompilationError):
            compiler.compile(QueryDSL(measures=["weird_fmt_cube.cnt"]))

    def test_h_scoped_table_refs_unaffected_by_injection(self):
        """Test H：默认注入只改 where_parts，不动 scoped_table_refs（审查补正③安全锚点）。"""
        compiler = self._make_compiler([ANSWER, STUDENT, SCHOOL])
        result = compiler.compile(QueryDSL(measures=["answer_records.total_count"]))
        assert result.scoped_table_refs == [
            {"table": "dwd_answer", "alias": "answer_records", "scan_anchor": "from"}
        ]


# ── Dialect 测试 ──

class TestMaxComputeDialect:

    def test_apply_granularity_day_string(self):
        d = MaxComputeDialect()
        result = d.apply_granularity("ds", "day", "string")
        assert result == "ds"

    def test_apply_granularity_month_string(self):
        d = MaxComputeDialect()
        result = d.apply_granularity("ds", "month", "string")
        assert "SUBSTR" in result

    def test_apply_granularity_week_string(self):
        d = MaxComputeDialect()
        result = d.apply_granularity("ds", "week", "string")
        assert "WEEKOFYEAR" in result

    def test_apply_granularity_unsupported(self):
        d = MaxComputeDialect()
        with pytest.raises(ValueError):
            d.apply_granularity("ds", "second", "string")

    def test_partition_condition(self):
        d = MaxComputeDialect()
        cond = d.partition_condition("ds", "20260101", "20260131", "yyyyMMdd")
        assert "ds >= '20260101'" in cond
        assert "ds <= '20260131'" in cond

    def test_latest_partition_expr(self):
        d = MaxComputeDialect()
        assert "MAX_PT" in d.latest_partition_expr("some_table")

    def test_default_limit(self):
        d = MaxComputeDialect()
        assert d.default_limit() == 50000


class TestRatioMeasure:
    """ratio 度量编译：SUM(分子)/NULLIF(SUM(分母),0)，按维度分组可答（守卫保留）。"""

    def _ratio_cube(self):
        return _make_cube(
            "answer_stats", "dws_answer_stats",
            dims={
                "school_name": DimensionDef(title="学校", type="string", sql="{CUBE}.school_name"),
                "stat_id": DimensionDef(title="ID", type="string", sql="{CUBE}.stat_id", primary_key=True),
            },
            measures={
                "sum_answer_duration": MeasureDef(title="答题总时长合计", type="sum", sql="SUM(`answer_duration`)"),
                "sum_answer_cnt": MeasureDef(title="答题次数合计", type="sum", sql="SUM(`answer_cnt`)"),
                "avg_answer_duration": MeasureDef(
                    title="平均答题时长",
                    type="ratio",
                    sql="{sum_answer_duration} / NULLIF({sum_answer_cnt}, 0)",
                    non_additive=False,
                ),
                "avg_legacy": MeasureDef(title="旧均值", type="avg", sql="AVG(`answer_duration`)", non_additive=True),
            },
        )

    def test_ratio_compiles_to_sum_over_sum_with_grouping(self):
        compiler = QueryCompiler(JoinGraph([self._ratio_cube()]))
        result = compiler.compile(
            QueryDSL(
                measures=["answer_stats.avg_answer_duration"],
                dimensions=["answer_stats.school_name"],
            )
        )
        flat = result.sql.replace(" ", "")
        assert "SUM(`answer_duration`)/NULLIF(SUM(`answer_cnt`),0)" in flat
        assert "GROUP BY" in result.sql
        # 不得叠加聚合 / 不得保留未展开占位符
        assert "{" not in result.sql
        assert "AVG(AVG(" not in flat.upper()

    def test_non_additive_avg_guard_still_blocks_grouped_query(self):
        """红线：non_additive 守卫保留——非可加 avg 度量带分组维度仍拒编译。"""
        compiler = QueryCompiler(JoinGraph([self._ratio_cube()]))
        with pytest.raises(CompilationError, match="non_additive"):
            compiler.compile(
                QueryDSL(
                    measures=["answer_stats.avg_legacy"],
                    dimensions=["answer_stats.school_name"],
                )
            )
