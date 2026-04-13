"""entities.py 单元测试 — 覆盖 Pydantic 校验、Recipe 反向索引提取"""
import pytest
from pydantic import ValidationError

from app.domain.semantic.entities import (
    CatalogDefinition,
    CubeDefinition,
    DefaultFilterDef,
    DimensionDef,
    DomainDefinition,
    DomainJoinDef,
    FilterDef,
    JoinDef,
    MeasureDef,
    PartitionDef,
    QueryDSL,
    RecipeDefinition,
    RecipeExample,
    SegmentDef,
    TimeDimensionDef,
    ViewCubeRef,
    ViewDefinition,
    generate_catalog_code,
    generate_domain_code,
)


# ── helpers ──────────────────────────────────

def _minimal_cube(**overrides) -> dict:
    base = dict(
        name="test_cube",
        title="测试 Cube",
        table="test_table",
        dimensions={"col1": {"title": "列1", "type": "string", "sql": "{CUBE}.col1"}},
        measures={"cnt": {"title": "总数", "type": "count", "sql": "{CUBE}.col1"}},
    )
    base.update(overrides)
    return base


# ── CubeDefinition ───────────────────────────

class TestCubeDefinition:

    def test_minimal_valid(self):
        cube = CubeDefinition(**_minimal_cube())
        assert cube.name == "test_cube"
        assert cube.data_source == "maxcompute"
        assert len(cube.dimensions) == 1
        assert len(cube.measures) == 1

    def test_full_valid(self):
        cube = CubeDefinition(**_minimal_cube(
            description="desc",
            data_source="clickhouse",
            partition={"field": "ds", "type": "string"},
            default_filters=[{"sql": "col > 0", "description": "正数"}],
            segments={"seg1": {"title": "分段", "sql": "col > 10"}},
            joins={"other": {"cube": "other", "sql": "{CUBE}.id = {other}.id"}},
        ))
        assert cube.data_source == "clickhouse"
        assert cube.partition.field == "ds"
        assert len(cube.default_filters) == 1
        assert "seg1" in cube.segments
        assert "other" in cube.joins

    def test_missing_name_raises(self):
        with pytest.raises(ValidationError):
            CubeDefinition(title="t", table="t",
                           dimensions={"c": {"title": "c", "type": "string", "sql": "c"}},
                           measures={"m": {"title": "m", "type": "count", "sql": "m"}})

    def test_empty_dimensions_raises(self):
        with pytest.raises(ValidationError, match="at least one dimension"):
            CubeDefinition(**_minimal_cube(dimensions={}))

    def test_empty_measures_raises(self):
        with pytest.raises(ValidationError, match="at least one measure"):
            CubeDefinition(**_minimal_cube(measures={}))

    def test_partition_defaults(self):
        p = PartitionDef(field="ds")
        assert p.type == "date"
        assert p.format == "yyyyMMdd"
        assert p.max_range_days == 90

    def test_dimension_with_enum(self):
        dim = DimensionDef(title="难度", type="number", sql="x",
                           enum={1: "简单", 2: "困难"})
        assert dim.enum[1] == "简单"

    def test_dimension_accepts_synonyms_and_tags(self):
        dim = DimensionDef(
            title="客户",
            type="string",
            sql="{CUBE}.customer_id",
            format="identity",
            synonyms=["会员ID", "顾客ID"],
            tags=["主键", "维度"],
        )
        assert dim.format == "identity"
        assert dim.synonyms == ["会员ID", "顾客ID"]
        assert dim.tags == ["主键", "维度"]

    def test_dimension_with_foreign_key(self):
        dim = DimensionDef(title="学生ID", type="string", sql="x",
                           foreign_key={"cube": "student", "field": "user_id"})
        assert dim.foreign_key.cube == "student"

    def test_measure_number_type(self):
        m = MeasureDef(title="正确率", type="number",
                       sql="ROUND({correct}/{total}, 2)", format="percent")
        assert m.type == "number"
        assert m.format == "percent"

    def test_measure_description_and_certified_defaults(self):
        m = MeasureDef(title="订单数", type="count", sql="{CUBE}.order_id")
        assert m.description is None
        assert m.certified is False

    def test_measure_accepts_description_and_certified(self):
        m = MeasureDef(
            title="总金额",
            type="sum",
            sql="{CUBE}.amount",
            description="已支付订单金额汇总",
            certified=True,
        )
        assert m.description == "已支付订单金额汇总"
        assert m.certified is True

    def test_measure_accepts_synonyms_and_tags(self):
        m = MeasureDef(
            title="总金额",
            type="sum",
            sql="{CUBE}.amount",
            synonyms=["GMV", "成交额"],
            tags=["核心指标", "营收"],
        )
        assert m.synonyms == ["GMV", "成交额"]
        assert m.tags == ["核心指标", "营收"]

    def test_join_defaults(self):
        j = JoinDef(cube="other", sql="a=b")
        assert j.type == "left"
        assert j.relationship == "N:1"


# ── ViewDefinition ───────────────────────────

class TestViewDefinition:

    def test_valid_view(self):
        view = ViewDefinition(
            name="v1", title="视图",
            cubes=[{"join_path": "answer_records", "includes": ["col1"]}],
        )
        assert view.public is True
        assert view.cubes[0].prefix is False

    def test_empty_cubes_raises(self):
        with pytest.raises(ValidationError, match="at least one Cube"):
            ViewDefinition(name="v1", title="t", cubes=[])

    def test_wildcard_includes(self):
        ref = ViewCubeRef(join_path="cube_a", includes="*", excludes=["secret"])
        assert ref.includes == "*"
        assert ref.excludes == ["secret"]


# ── RecipeDefinition ─────────────────────────

class TestRecipeDefinition:

    def test_valid_recipe(self):
        recipe = RecipeDefinition(
            name="r1", title="配方",
            tags=["tag1"],
            examples=[{
                "question": "q",
                "dsl": {"measures": ["cube_a.cnt"], "dimensions": ["cube_a.col"]},
            }],
        )
        assert recipe.name == "r1"

    def test_empty_examples_raises(self):
        with pytest.raises(ValidationError, match="at least one example"):
            RecipeDefinition(name="r1", title="t", examples=[])

    def test_extract_cube_names_from_measures_and_dimensions(self):
        recipe = RecipeDefinition(
            name="r1", title="t",
            examples=[{
                "question": "q",
                "dsl": {
                    "measures": ["answer_records.total_count", "answer_records.accuracy"],
                    "dimensions": ["student.user_name"],
                },
            }],
        )
        assert recipe.extract_cube_names() == {"answer_records", "student"}

    def test_extract_cube_names_from_filters_and_time_dimensions(self):
        recipe = RecipeDefinition(
            name="r1", title="t",
            examples=[{
                "question": "q",
                "dsl": {
                    "measures": ["a.cnt"],
                    "filters": [{"dimension": "b.col", "operator": "equals", "values": [1]}],
                    "time_dimensions": [{"dimension": "c.ds", "date_range": ["2026-01-01", "2026-01-31"]}],
                },
            }],
        )
        names = recipe.extract_cube_names()
        assert names == {"a", "b", "c"}

    def test_extract_cube_names_multiple_examples(self):
        recipe = RecipeDefinition(
            name="r1", title="t",
            examples=[
                {"question": "q1", "dsl": {"measures": ["x.m1"]}},
                {"question": "q2", "dsl": {"measures": ["y.m2"], "dimensions": ["z.d1"]}},
            ],
        )
        assert recipe.extract_cube_names() == {"x", "y", "z"}

    def test_extract_cube_names_from_segments_member_filters_and_order(self):
        recipe = RecipeDefinition(
            name="r2",
            title="扩展 DSL",
            examples=[{
                "question": "q",
                "dsl": {
                    "measures": ["a.cnt"],
                    "segments": ["seg_cube.active_users", {"ignored": True}],
                    "filters": [{"member": "member_cube.status", "operator": "equals", "values": ["ok"]}],
                    "order": [["order_cube.score", "desc"], []],
                },
            }],
        )

        assert recipe.extract_cube_names() == {"a", "seg_cube", "member_cube", "order_cube"}


# ── QueryDSL ─────────────────────────────────

class TestQueryDSL:

    def test_empty_dsl(self):
        dsl = QueryDSL()
        assert dsl.measures == []
        assert dsl.limit is None

    def test_full_dsl(self):
        dsl = QueryDSL(
            measures=["a.cnt"],
            dimensions=["a.col"],
            filters=[{"dimension": "a.type", "operator": "equals", "values": ["x"]}],
            time_dimensions=[{"dimension": "a.ds", "date_range": ["2026-01-01", "2026-01-31"]}],
            segments=["a.active"],
            order=[["a.cnt", "desc"]],
            limit=100,
        )
        assert len(dsl.filters) == 1
        assert dsl.filters[0].target == "a.type"

    def test_filter_requires_target(self):
        with pytest.raises(ValidationError, match="dimension.*member"):
            FilterDef(operator="equals", values=[1])


class TestDomainEntities:

    def test_domain_join_requires_strategy_for_one_to_many(self):
        with pytest.raises(ValidationError, match="aggregation_strategy"):
            DomainJoinDef(
                name="student_to_orders",
                source_cube="student",
                target_cube="orders",
                source_field="student_id",
                target_field="student_id",
                cardinality="1:N",
            )

    def test_domain_definition_normalizes_id_and_accepts_unique_joins(self):
        domain = DomainDefinition(
            code="learning",
            name="学习域",
            cubes=["student", "orders"],
            joins=[
                {
                    "name": "student_orders",
                    "source_cube": "student",
                    "target_cube": "orders",
                    "source_field": "student_id",
                    "target_field": "student_id",
                    "cardinality": "N:1",
                }
            ],
        )
        assert domain.id == "learning"
        assert domain.joins[0].name == "student_orders"

    def test_domain_definition_rejects_duplicate_cubes(self):
        with pytest.raises(ValidationError, match="重复 Cube"):
            DomainDefinition(
                code="learning",
                name="学习域",
                cubes=["student", "student"],
            )

    def test_domain_definition_rejects_duplicate_directed_edges(self):
        duplicate_join = {
            "name": "student_orders",
            "source_cube": "student",
            "target_cube": "orders",
            "source_field": "student_id",
            "target_field": "student_id",
        }
        with pytest.raises(ValidationError, match="重复同向关系"):
            DomainDefinition(
                code="learning",
                name="学习域",
                cubes=["student", "orders"],
                joins=[duplicate_join, {**duplicate_join, "name": "student_orders_2"}],
            )

    def test_catalog_definition_defaults(self):
        catalog = CatalogDefinition(code="learning", name="学习分析")
        assert catalog.status == "active"
        assert catalog.sort_order == 100

    def test_generate_domain_and_catalog_code_are_stable(self):
        assert generate_domain_code("Learning Domain") == "learning_domain"
        assert generate_catalog_code("Learning Catalog") == "learning_catalog"

    def test_generate_code_falls_back_for_non_alnum_names(self):
        domain_code = generate_domain_code("###")
        catalog_code = generate_catalog_code("！！！")
        assert domain_code.startswith("domain_")
        assert len(domain_code) == len("domain_") + 8
        assert catalog_code.startswith("catalog_")
        assert len(catalog_code) == len("catalog_") + 8
