"""Phase 1.3 — JoinGraph + Compiler 单元测试

覆盖 PRD 6.11 测试用例矩阵中的核心场景"""
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


# ── Compiler 基础测试 ──

class TestCompilerBasic:

    def test_single_cube_simple_count(self, compiler):
        """TC-01: 单 Cube 单指标"""
        dsl = QueryDSL(measures=["answer_records.total_count"])
        result = compiler.compile(dsl)
        assert "COUNT(answer_records.answer_record_id)" in result.sql
        assert result.primary_cube == "answer_records"
        assert "LIMIT" in result.sql

    def test_dimension_and_measure(self, compiler):
        """TC-02: 单 Cube 维度+指标"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
            dimensions=["answer_records.subject_name"],
        )
        result = compiler.compile(dsl)
        assert "answer_records.subject_name" in result.sql
        assert "GROUP BY" in result.sql

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

    def test_latest_partition_fallback(self, compiler):
        """无时间范围时应注入 MAX_PT"""
        dsl = QueryDSL(
            measures=["answer_records.total_count"],
        )
        # answer_records 没有 latest_expr，不应注入
        result = compiler.compile(dsl)
        assert "MAX_PT" not in result.sql


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
