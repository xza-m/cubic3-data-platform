"""
SQL 生成服务测试
"""
from unittest.mock import MagicMock

import pytest

from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.domain.services.sql_generator import SQLGeneratorService
from app.shared.enums import DatasetType
from app.shared.exceptions import InvalidFieldsError, SQLGenerationError


def _mock_field(
    name: str,
    *,
    sensitive: bool = False,
    masked_expression: str | None = None,
) -> DatasetField:
    field = MagicMock(spec=DatasetField)
    field.physical_name = name
    field.is_sensitive.return_value = sensitive
    field.get_masked_select_expression.return_value = masked_expression or f"MASK({name}) AS {name}"
    return field


def _mock_dataset(
    *,
    dataset_type: str = DatasetType.PHYSICAL.value,
    physical_table: str | None = "ods.orders",
    sql_query: str | None = None,
    fields: list[DatasetField] | None = None,
) -> Dataset:
    dataset = MagicMock(spec=Dataset)
    dataset.dataset_type = dataset_type
    dataset.physical_table = physical_table
    dataset.sql_query = sql_query
    query = MagicMock()
    query.all.return_value = fields or [
        _mock_field("id"),
        _mock_field("city"),
        _mock_field("amount"),
    ]
    dataset.fields = query
    return dataset


class TestSQLGeneratorService:
    @pytest.fixture
    def service(self) -> SQLGeneratorService:
        return SQLGeneratorService()

    def test_generate_sql_for_physical_dataset(self, service: SQLGeneratorService):
        dataset = _mock_dataset()

        sql = service.generate_sql(
            dataset=dataset,
            select_fields=["id", "amount"],
            filter_conditions={
                "logic": "AND",
                "filters": [{"field": "amount", "operator": ">=", "value": 100}],
            },
            limit=20,
            apply_masking=False,
        )

        assert sql == (
            "SELECT id, amount\n"
            "FROM ods.orders\n"
            "WHERE amount >= 100\n"
            "LIMIT 20"
        )

    def test_generate_sql_uses_masked_select_expression(self, service: SQLGeneratorService):
        dataset = _mock_dataset(
            fields=[
                _mock_field("id"),
                _mock_field("mobile", sensitive=True, masked_expression="MASKED_MOBILE AS mobile"),
            ]
        )

        sql = service.generate_sql(
            dataset=dataset,
            select_fields=["id", "mobile"],
            filter_conditions={},
            limit=5,
            apply_masking=True,
        )

        assert "SELECT id, MASKED_MOBILE AS mobile" in sql

    def test_generate_sql_with_empty_select_fields_uses_wildcard(self, service: SQLGeneratorService):
        dataset = _mock_dataset()

        sql = service.generate_sql(
            dataset=dataset,
            select_fields=[],
            filter_conditions={},
            limit=0,
            apply_masking=False,
        )

        assert sql == "SELECT *\nFROM ods.orders"

    def test_generate_sql_for_virtual_dataset_removes_inner_limit(self, service: SQLGeneratorService):
        dataset = _mock_dataset(
            dataset_type=DatasetType.VIRTUAL.value,
            physical_table=None,
            sql_query=" SELECT * FROM raw_orders LIMIT 10; ",
        )

        sql = service.generate_sql(
            dataset=dataset,
            select_fields=["id"],
            filter_conditions={},
            limit=30,
            apply_masking=False,
        )

        assert "FROM (\nSELECT * FROM raw_orders\n) AS virtual_dataset" in sql
        assert sql.endswith("LIMIT 30")
        assert "LIMIT 10" not in sql

    def test_generate_sql_rejects_outer_filter_for_virtual_dataset(self, service: SQLGeneratorService):
        dataset = _mock_dataset(
            dataset_type=DatasetType.VIRTUAL.value,
            physical_table=None,
            sql_query="SELECT * FROM raw_orders",
        )

        with pytest.raises(SQLGenerationError, match="虚拟数据集不支持外层过滤条件"):
            service.generate_sql(
                dataset=dataset,
                select_fields=["id"],
                filter_conditions={"filters": [{"field": "id", "operator": "=", "value": 1}]},
                apply_masking=False,
            )

    def test_generate_sql_wraps_validation_error(self, service: SQLGeneratorService):
        dataset = _mock_dataset(fields=[_mock_field("id")])

        with pytest.raises(SQLGenerationError, match="Invalid fields: missing"):
            service.generate_sql(
                dataset=dataset,
                select_fields=["missing"],
                filter_conditions={},
                apply_masking=False,
            )

    def test_validate_fields_allows_empty_and_rejects_invalid(self, service: SQLGeneratorService):
        dataset = _mock_dataset(fields=[_mock_field("id"), _mock_field("name")])

        service._validate_fields([], dataset)

        with pytest.raises(InvalidFieldsError) as exc:
            service._validate_fields(["id", "email"], dataset)

        assert exc.value.details["invalid_fields"] == ["email"]

    def test_build_select_clause_skips_unknown_field(self, service: SQLGeneratorService):
        dataset = _mock_dataset(fields=[_mock_field("id")])

        clause = service._build_select_clause(["id", "missing"], dataset, apply_masking=False)

        assert clause == "id"

    def test_build_from_clause_validates_required_source(self, service: SQLGeneratorService):
        virtual_dataset = _mock_dataset(
            dataset_type=DatasetType.VIRTUAL.value,
            physical_table=None,
            sql_query=None,
        )
        physical_dataset = _mock_dataset(physical_table=None)

        with pytest.raises(SQLGenerationError, match="虚拟数据集缺少 SQL 查询定义"):
            service._build_from_clause(virtual_dataset)

        with pytest.raises(SQLGenerationError, match="physical 数据集缺少物理表名"):
            service._build_from_clause(physical_dataset)

    def test_build_where_clause_supports_nested_groups(self, service: SQLGeneratorService):
        dataset = _mock_dataset()

        clause = service._build_where_clause(
            {
                "logic": "OR",
                "filters": [
                    {"field": "city", "operator": "=", "value": "杭州"},
                    {"field": None, "operator": "=", "value": "ignored"},
                ],
                "groups": [
                    {
                        "logic": "AND",
                        "filters": [
                            {"field": "amount", "operator": "BETWEEN", "value": [1, 9]},
                            {"field": "id", "operator": "IS NOT NULL", "value": None},
                        ],
                    }
                ],
            },
            dataset,
        )

        assert clause == "city = '杭州' OR (amount BETWEEN 1 AND 9 AND id IS NOT NULL)"

    @pytest.mark.parametrize(
        ("operator", "value", "expected"),
        [
            ("=", "A", "city = 'A'"),
            ("!=", "A", "city != 'A'"),
            (">", 1, "city > 1"),
            ("<", 1, "city < 1"),
            (">=", 1, "city >= 1"),
            ("<=", 1, "city <= 1"),
            ("IN", ["A", "B"], "city IN ('A', 'B')"),
            ("IN", "A", "city IN ('A')"),
            ("NOT IN", ["A", "B"], "city NOT IN ('A', 'B')"),
            ("LIKE", "Hang", "city LIKE '%Hang%'"),
            ("IS NULL", None, "city IS NULL"),
            ("IS NOT NULL", None, "city IS NOT NULL"),
        ],
    )
    def test_build_condition_for_supported_operators(
        self,
        service: SQLGeneratorService,
        operator: str,
        value: object,
        expected: str,
    ):
        dataset = _mock_dataset()

        result = service._build_condition("city", operator, value, dataset)

        assert result == expected

    def test_build_condition_returns_empty_for_invalid_between_or_unknown_operator(self, service: SQLGeneratorService):
        dataset = _mock_dataset()

        assert service._build_condition("city", "BETWEEN", [1], dataset) == ""
        assert service._build_condition("city", "UNKNOWN", 1, dataset) == ""

    def test_build_condition_validates_field_and_value(self, service: SQLGeneratorService):
        dataset = _mock_dataset()

        with pytest.raises(ValueError, match="Invalid field name"):
            service._build_condition("city.name", "=", "A", dataset)

        with pytest.raises(ValueError, match="SQL injection"):
            service._build_condition("city", "=", "DROP TABLE users", dataset)

    def test_remove_limit_clause(self, service: SQLGeneratorService):
        assert service._remove_limit_clause("SELECT * FROM t LIMIT 10") == "SELECT * FROM t"
        assert service._remove_limit_clause("SELECT * FROM t LIMIT 10 OFFSET 20") == "SELECT * FROM t"
        assert service._remove_limit_clause("SELECT * FROM t WHERE id = 1") == "SELECT * FROM t WHERE id = 1"
