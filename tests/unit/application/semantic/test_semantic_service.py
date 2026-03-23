"""Phase 1.4 — SemanticLayerService + Agent 工具集成测试"""
import pytest

from app.application.semantic.semantic_service import SemanticLayerService
from app.domain.semantic.entities import (
    CubeDefinition,
    DimensionDef,
    JoinDef,
    MeasureDef,
    ViewDefinition,
)
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
from app.infrastructure.semantic.yaml_domain_repository import YamlDomainRepository
from app.infrastructure.semantic.yaml_view_repository import YamlViewRepository
from app.infrastructure.semantic.yaml_recipe_repository import YamlRecipeRepository


@pytest.fixture
def service(tmp_path):
    """用实际 YAML 文件构建 SemanticLayerService"""
    import os
    base = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))),
        "app", "infrastructure", "semantic",
    )
    cube_repo = YamlCubeRepository(os.path.join(base, "cubes"))
    domain_repo = YamlDomainRepository(os.path.join(base, "domains"))
    view_repo = YamlViewRepository(os.path.join(base, "views"))
    recipe_repo = YamlRecipeRepository(os.path.join(base, "recipes"))
    return SemanticLayerService(
        cube_repo=cube_repo,
        domain_repo=domain_repo,
        view_repo=view_repo,
        recipe_repo=recipe_repo,
        enum_loader=lambda _dict_type: {"1": "正式", "0": "测试"},
    )


class _InMemoryRepo:
    def __init__(self, items):
        self._items = {item.name: item for item in items}

    def list_all(self):
        return list(self._items.values())

    def get(self, name):
        return self._items.get(name)

    def save(self, item):
        self._items[item.name] = item

    def delete(self, name):
        return self._items.pop(name, None) is not None

    def get_by_cube(self, _name):
        return []


class TestListCubes:

    def test_returns_all_14_cubes(self, service):
        cubes = service.list_cubes()
        assert len(cubes) == 14

    def test_cube_has_required_fields(self, service):
        cubes = service.list_cubes()
        for c in cubes:
            assert "name" in c
            assert "title" in c
            assert "dimensions" in c
            assert "measures" in c
            assert "dimension_count" in c
            assert c["dimension_count"] > 0

    def test_student_cube_details(self, service):
        cubes = service.list_cubes()
        student = next(c for c in cubes if c["name"] == "student")
        assert student["title"] == "学生"
        assert "user_id" in student["dimensions"]


class TestDescribeCube:

    def test_describe_existing_cube(self, service):
        result = service.describe_cube("answer_records")
        assert result["name"] == "answer_records"
        assert "dimensions" in result
        assert "measures" in result
        assert "joins" in result
        assert "partition" in result

    def test_describe_with_recipes(self, service):
        result = service.describe_cube("answer_records")
        assert "examples" in result
        assert len(result["examples"]) > 0
        assert "question" in result["examples"][0]
        assert "dsl" in result["examples"][0]

    def test_describe_with_enums(self, service):
        result = service.describe_cube("student")
        user_is_test = result["dimensions"].get("user_is_test", {})
        assert "enum" in user_is_test

    def test_describe_nonexistent(self, service):
        result = service.describe_cube("nonexistent_cube")
        assert "error" in result

    def test_describe_default_filters(self, service):
        result = service.describe_cube("student")
        assert "default_filters" in result
        assert len(result["default_filters"]) > 0

    def test_describe_cube_returns_dynamic_enum_and_diagnostics(self):
        cube = CubeDefinition(
            name="enum_cube",
            title="动态枚举",
            table="dim_enum",
            dimensions={
                "status": DimensionDef(
                    title="状态",
                    type="number",
                    sql="{CUBE}.status",
                    enum_source={"dict_type": "user_status"},
                )
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.status")},
        )
        service = SemanticLayerService(
            cube_repo=_InMemoryRepo([cube]),
            view_repo=_InMemoryRepo([]),
            recipe_repo=_InMemoryRepo([]),
            enum_loader=lambda dict_type: {"1": "启用"} if dict_type == "user_status" else None,
        )
        result = service.describe_cube("enum_cube")
        assert result["dimensions"]["status"]["enum"] == {"1": "启用"}
        assert not any(item["level"] == "error" for item in result["diagnostics"])

    def test_describe_cube_reports_invalid_grain_and_entity_key(self):
        cube = CubeDefinition(
            name="orders",
            title="订单",
            table="fact_orders",
            grain="missing_dim",
            entity_key="missing_key",
            dimensions={
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id"),
            },
            measures={"cnt": MeasureDef(title="数量", type="count", sql="{CUBE}.order_id")},
        )
        service = SemanticLayerService(
            cube_repo=_InMemoryRepo([cube]),
            view_repo=_InMemoryRepo([]),
            recipe_repo=_InMemoryRepo([]),
        )
        result = service.describe_cube("orders")
        kinds = {item["kind"] for item in result["diagnostics"]}
        assert "invalid_grain_dimension" in kinds
        assert "invalid_entity_key_dimension" in kinds

    def test_describe_cube_returns_measure_description_and_certified(self):
        cube = CubeDefinition(
            name="orders",
            title="订单",
            table="fact_orders",
            dimensions={
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id"),
            },
            measures={
                "total_amount": MeasureDef(
                    title="总金额",
                    type="sum",
                    sql="{CUBE}.amount",
                    description="已支付订单金额汇总",
                    certified=True,
                )
            },
        )
        service = SemanticLayerService(
            cube_repo=_InMemoryRepo([cube]),
            view_repo=_InMemoryRepo([]),
            recipe_repo=_InMemoryRepo([]),
        )
        result = service.describe_cube("orders")
        assert result["measures"]["total_amount"]["name"] == "total_amount"
        assert result["measures"]["total_amount"]["description"] == "已支付订单金额汇总"
        assert result["measures"]["total_amount"]["certified"] is True

    def test_list_cubes_returns_state_summary(self, service):
        cubes = service.list_cubes()
        first_cube = cubes[0]
        assert "state_summary" in first_cube
        assert "definition_hash" in first_cube["state_summary"]


class TestCompileQuery:

    def test_simple_count(self, service):
        dsl = {"measures": ["answer_records.total_count"]}
        result = service.compile_query(dsl)
        assert "COUNT" in result.sql
        assert "answer_records" in result.sql

    def test_cross_cube_with_filter(self, service):
        dsl = {
            "domain_code": "academic",
            "measures": ["answer_records.total_count", "answer_records.accuracy"],
            "dimensions": ["answer_records.subject_name"],
            "filters": [
                {"dimension": "student.user_name", "operator": "equals", "values": ["倪佳俊"]}
            ],
            "time_dimensions": [
                {"dimension": "answer_records.answer_date", "date_range": ["2026-02-21", "2026-02-27"]}
            ],
            "order": [["answer_records.accuracy", "desc"]],
            "limit": 1000,
        }
        result = service.compile_query(dsl)
        assert "LEFT JOIN" in result.sql
        assert "dim_ucenter_user_student_df" in result.sql
        assert "student.user_name = '倪佳俊'" in result.sql
        assert "LIMIT 1000" in result.sql

    def test_compile_error_returns_error(self, service):
        from app.domain.semantic.compiler import UnknownCubeError
        dsl = {"measures": ["nonexistent.total_count"]}
        with pytest.raises(UnknownCubeError):
            service.compile_query(dsl)

    def test_real_recipe_examples_compile_successfully(self, service):
        recipes = service._recipe_repo.list_all()
        compiled_count = 0
        for recipe in recipes:
            for example in recipe.examples:
                result = service.compile_query(example.dsl)
                assert "SELECT" in result.sql
                compiled_count += 1
                if compiled_count >= 3:
                    return
        pytest.fail("未找到至少 3 个可编译的真实 Recipe 示例")


class TestViews:

    def test_list_views_defaults_to_public_only(self, service):
        public_views = service.list_views()
        all_views = service.list_views(public_only=False)
        assert len(all_views) >= len(public_views)
        assert all(view.public for view in public_views)

    def test_expand_view_uses_terminal_cube_from_join_path(self):
        fact = CubeDefinition(
            name="fact_sales",
            title="销售事实",
            table="fact_sales",
            dimensions={
                "student_id": DimensionDef(title="学生ID", type="string", sql="{CUBE}.student_id"),
            },
            measures={"order_count": MeasureDef(title="订单数", type="count", sql="{CUBE}.student_id")},
            joins={
                "student": JoinDef(
                    cube="student",
                    type="left",
                    sql="{CUBE}.student_id = {student}.user_id",
                )
            },
        )
        student = CubeDefinition(
            name="student",
            title="学生",
            table="dim_student",
            dimensions={
                "user_id": DimensionDef(title="用户ID", type="string", sql="{CUBE}.user_id", primary_key=True),
                "user_name": DimensionDef(title="用户名", type="string", sql="{CUBE}.user_name"),
            },
            measures={"student_total": MeasureDef(title="学生数", type="count", sql="{CUBE}.user_id")},
        )
        view = ViewDefinition(
            name="sales_student_view",
            title="销售学生视图",
            cubes=[{"join_path": "fact_sales.student", "includes": ["user_name"], "prefix": True}],
        )
        service = SemanticLayerService(
            cube_repo=_InMemoryRepo([fact, student]),
            view_repo=_InMemoryRepo([view]),
            recipe_repo=_InMemoryRepo([]),
        )
        dsl = service.expand_view_to_dsl(view)
        assert dsl["dimensions"] == ["student.user_name"]
        assert dsl["field_mappings"][0]["physical_name"] == "student__user_name"
        assert dsl["field_mappings"][0]["display_name"] == "学生.用户名"


class TestCompileAndExecute:

    def test_compilation_error_returns_retryable(self, service):
        dsl = {"measures": ["nonexistent.count"]}
        result = service.compile_and_execute(dsl, adapter=None)
        assert "error" in result
        assert result["retryable"] is True

    def test_successful_compilation_mock_adapter(self, service):
        class MockAdapter:
            def execute_query(self, sql, limit=50000):
                return {
                    "columns": ["subject_name", "total_count"],
                    "data": [["数学", 100], ["英语", 80]],
                }
        dsl = {
            "measures": ["answer_records.total_count"],
            "dimensions": ["answer_records.subject_name"],
        }
        result = service.compile_and_execute(dsl, adapter=MockAdapter())
        assert result["row_count"] == 2
        assert "sql" in result
        assert "columns" in result

    def test_adapter_exception_retryable(self, service):
        class BrokenAdapter:
            def execute_query(self, sql, limit=50000):
                raise RuntimeError("Connection timeout")
        dsl = {"measures": ["answer_records.total_count"]}
        result = service.compile_and_execute(dsl, adapter=BrokenAdapter())
        assert "error" in result
        assert result["retryable"] is True

    def test_adapter_exception_non_retryable(self, service):
        class SyntaxErrorAdapter:
            def execute_query(self, sql, limit=50000):
                raise RuntimeError("ODPS-0130: Syntax error at line 1")
        dsl = {"measures": ["answer_records.total_count"]}
        result = service.compile_and_execute(dsl, adapter=SyntaxErrorAdapter())
        assert "error" in result
        assert result["retryable"] is False

    def test_query_returns_compilation_metadata(self, service):
        class MockAdapter:
            def execute_query(self, sql, limit=50000):
                return {"columns": ["total_count"], "data": [[1]]}

        result = service.query({"measures": ["answer_records.total_count"]}, adapter=MockAdapter())
        assert result["primary_cube"] == "answer_records"
        assert result["joined_cubes"] == []
        assert result["retryable"] is False
