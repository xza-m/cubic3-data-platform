"""
SQL 方言测试
"""
import pytest

from app.domain.semantic.dialects import (
    ClickHouseDialect,
    MaxComputeDialect,
    MySQLDialect,
    PostgreSQLDialect,
)


class TestMaxComputeDialect:
    @pytest.mark.parametrize(
        ("granularity", "expected"),
        [
            ("day", "ds"),
            ("week", "WEEKOFYEAR"),
            ("month", "SUBSTR(ds,1,6)"),
            ("quarter", "CEIL"),
            ("year", "SUBSTR(ds,1,4)"),
        ],
    )
    def test_string_granularity(self, granularity: str, expected: str):
        result = MaxComputeDialect().apply_granularity("ds", granularity, "string")
        assert expected in result

    @pytest.mark.parametrize(
        ("granularity", "expected"),
        [
            ("day", "yyyy-MM-dd"),
            ("week", "DATETRUNC"),
            ("month", "yyyy-MM"),
            ("quarter", "DATETRUNC"),
            ("year", "yyyy"),
        ],
    )
    def test_datetime_granularity(self, granularity: str, expected: str):
        result = MaxComputeDialect().apply_granularity("created_at", granularity, "datetime")
        assert expected in result

    def test_unsupported_granularity(self):
        with pytest.raises(ValueError, match="Unsupported granularity"):
            MaxComputeDialect().apply_granularity("ds", "hour", "string")

    def test_partition_and_limit_contract(self):
        dialect = MaxComputeDialect()
        assert dialect.partition_condition("ds", "20260101", "20260131", "yyyyMMdd") == "ds >= '20260101' AND ds <= '20260131'"
        assert dialect.latest_partition_expr("fact_orders") == "MAX_PT('fact_orders')"
        assert dialect.default_limit() == 50000


class TestPostgreSQLDialect:
    def test_string_day_supported_only_for_day(self):
        dialect = PostgreSQLDialect()
        assert dialect.apply_granularity("ds", "day", "string") == "ds"

        with pytest.raises(ValueError, match="Unsupported granularity 'month' for string column"):
            dialect.apply_granularity("ds", "month", "string")

    @pytest.mark.parametrize(
        ("granularity", "expected"),
        [
            ("day", "DATE_TRUNC('day'"),
            ("week", "DATE_TRUNC('week'"),
            ("month", "DATE_TRUNC('month'"),
            ("quarter", "DATE_TRUNC('quarter'"),
            ("year", "DATE_TRUNC('year'"),
        ],
    )
    def test_datetime_granularity(self, granularity: str, expected: str):
        assert expected in PostgreSQLDialect().apply_granularity("created_at", granularity, "timestamp")

    def test_other_contracts(self):
        dialect = PostgreSQLDialect()
        assert dialect.partition_condition("ds", "1", "2", "fmt") == "ds >= '1' AND ds <= '2'"
        assert dialect.latest_partition_expr("fact_orders") == "(SELECT MAX(ds) FROM fact_orders)"
        assert dialect.default_limit() == 50000

    def test_datetime_unsupported_granularity(self):
        with pytest.raises(ValueError, match="Unsupported granularity 'hour'"):
            PostgreSQLDialect().apply_granularity("created_at", "hour", "timestamp")


class TestMySQLDialect:
    def test_granularity_contract(self):
        dialect = MySQLDialect()
        assert dialect.apply_granularity("ds", "day", "string") == "ds"
        assert "DATE_FORMAT" in dialect.apply_granularity("created_at", "month", "datetime")
        assert "QUARTER" in dialect.apply_granularity("created_at", "quarter", "datetime")

        with pytest.raises(ValueError, match="Unsupported granularity"):
            dialect.apply_granularity("created_at", "hour", "datetime")

    def test_other_contracts(self):
        dialect = MySQLDialect()
        assert dialect.partition_condition("ds", "1", "2", "fmt") == "ds >= '1' AND ds <= '2'"
        assert dialect.latest_partition_expr("fact_orders") == "(SELECT MAX(ds) FROM fact_orders)"
        assert dialect.default_limit() == 50000


class TestClickHouseDialect:
    def test_granularity_contract(self):
        dialect = ClickHouseDialect()
        assert dialect.apply_granularity("ds", "day", "string") == "ds"
        assert "toStartOfWeek" in dialect.apply_granularity("created_at", "week", "datetime")
        assert "toStartOfMonth" in dialect.apply_granularity("created_at", "month", "datetime")
        assert "toQuarter" in dialect.apply_granularity("created_at", "quarter", "datetime")
        assert "toYear" in dialect.apply_granularity("created_at", "year", "datetime")

        with pytest.raises(ValueError, match="Unsupported granularity"):
            dialect.apply_granularity("created_at", "hour", "datetime")

    def test_other_contracts(self):
        dialect = ClickHouseDialect()
        assert dialect.partition_condition("ds", "1", "2", "fmt") == "ds >= '1' AND ds <= '2'"
        assert dialect.latest_partition_expr("fact_orders") == "(SELECT MAX(ds) FROM fact_orders)"
        assert dialect.default_limit() == 50000
