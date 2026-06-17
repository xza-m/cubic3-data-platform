"""SQL 方言抽象 — P1 仅实现 MaxComputeDialect"""
from __future__ import annotations

from abc import ABC, abstractmethod


class SQLDialect(ABC):

    @abstractmethod
    def apply_granularity(self, col: str, granularity: str, col_type: str) -> str: ...

    @abstractmethod
    def partition_condition(self, field: str, start: str, end: str, fmt: str) -> str: ...

    @abstractmethod
    def latest_partition_expr(self, table: str) -> str: ...

    @abstractmethod
    def default_limit(self) -> int: ...

    def quote_identifier(self, name: str) -> str:
        """别名/标识符引用，默认 MaxCompute/MySQL 风格反引号。"""
        return f"`{name}`"


class MaxComputeDialect(SQLDialect):
    """MaxCompute SQL 方言 — 封装 DATETRUNC/WEEKOFYEAR/MAX_PT 等专用函数"""

    _GRAN_STRING = {
        "day":     lambda c: c,
        "week":    lambda c: f"CONCAT(SUBSTR({c},1,4), 'W', LPAD(WEEKOFYEAR(TO_DATE({c},'yyyyMMdd')),2,'0'))",
        "month":   lambda c: f"SUBSTR({c},1,6)",
        "quarter": lambda c: f"CONCAT(SUBSTR({c},1,4), 'Q', CAST(CEIL(CAST(SUBSTR({c},5,2) AS INT)/3.0) AS STRING))",
        "year":    lambda c: f"SUBSTR({c},1,4)",
    }

    _GRAN_DATETIME = {
        "day":     lambda c: f"TO_CHAR({c}, 'yyyy-MM-dd')",
        "week":    lambda c: f"TO_CHAR(DATETRUNC({c}, 'WW'), 'yyyy-MM-dd')",
        "month":   lambda c: f"TO_CHAR(DATETRUNC({c}, 'MM'), 'yyyy-MM')",
        "quarter": lambda c: f"TO_CHAR(DATETRUNC({c}, 'Q'), 'yyyy-MM')",
        "year":    lambda c: f"TO_CHAR(DATETRUNC({c}, 'YYYY'), 'yyyy')",
    }

    def apply_granularity(self, col: str, granularity: str, col_type: str) -> str:
        mapping = self._GRAN_STRING if col_type == "string" else self._GRAN_DATETIME
        fn = mapping.get(granularity)
        if fn is None:
            raise ValueError(f"Unsupported granularity '{granularity}' for col_type '{col_type}'")
        return fn(col)

    def partition_condition(self, field: str, start: str, end: str, fmt: str) -> str:
        return f"{field} >= '{start}' AND {field} <= '{end}'"

    def latest_partition_expr(self, table: str) -> str:
        return f"MAX_PT('{table}')"

    def default_limit(self) -> int:
        return 50000


class PostgreSQLDialect(SQLDialect):
    def quote_identifier(self, name: str) -> str:
        return f'"{name}"'

    def apply_granularity(self, col: str, granularity: str, col_type: str) -> str:
        if col_type == "string":
            if granularity == "day":
                return col
            raise ValueError(f"Unsupported granularity '{granularity}' for string column")

        mapping = {
            "day": f"TO_CHAR(DATE_TRUNC('day', {col}), 'YYYY-MM-DD')",
            "week": f"TO_CHAR(DATE_TRUNC('week', {col}), 'YYYY-MM-DD')",
            "month": f"TO_CHAR(DATE_TRUNC('month', {col}), 'YYYY-MM')",
            "quarter": f"TO_CHAR(DATE_TRUNC('quarter', {col}), 'YYYY-MM')",
            "year": f"TO_CHAR(DATE_TRUNC('year', {col}), 'YYYY')",
        }
        if granularity not in mapping:
            raise ValueError(f"Unsupported granularity '{granularity}'")
        return mapping[granularity]

    def partition_condition(self, field: str, start: str, end: str, fmt: str) -> str:
        return f"{field} >= '{start}' AND {field} <= '{end}'"

    def latest_partition_expr(self, table: str) -> str:
        return f"(SELECT MAX(ds) FROM {table})"

    def default_limit(self) -> int:
        return 50000


class MySQLDialect(SQLDialect):
    def apply_granularity(self, col: str, granularity: str, col_type: str) -> str:
        mapping = {
            "day": f"DATE_FORMAT({col}, '%Y-%m-%d')",
            "week": f"DATE_FORMAT(DATE_SUB({col}, INTERVAL WEEKDAY({col}) DAY), '%Y-%m-%d')",
            "month": f"DATE_FORMAT({col}, '%Y-%m')",
            "quarter": f"CONCAT(YEAR({col}), '-Q', QUARTER({col}))",
            "year": f"DATE_FORMAT({col}, '%Y')",
        }
        if col_type == "string" and granularity == "day":
            return col
        if granularity not in mapping:
            raise ValueError(f"Unsupported granularity '{granularity}'")
        return mapping[granularity]

    def partition_condition(self, field: str, start: str, end: str, fmt: str) -> str:
        return f"{field} >= '{start}' AND {field} <= '{end}'"

    def latest_partition_expr(self, table: str) -> str:
        return f"(SELECT MAX(ds) FROM {table})"

    def default_limit(self) -> int:
        return 50000


class ClickHouseDialect(SQLDialect):
    def apply_granularity(self, col: str, granularity: str, col_type: str) -> str:
        mapping = {
            "day": f"formatDateTime(toDateTime({col}), '%Y-%m-%d')",
            "week": f"formatDateTime(toStartOfWeek(toDateTime({col})), '%Y-%m-%d')",
            "month": f"formatDateTime(toStartOfMonth(toDateTime({col})), '%Y-%m')",
            "quarter": f"concat(toString(toYear(toDateTime({col}))), '-Q', toString(toQuarter(toDateTime({col}))))",
            "year": f"toString(toYear(toDateTime({col})))",
        }
        if col_type == "string" and granularity == "day":
            return col
        if granularity not in mapping:
            raise ValueError(f"Unsupported granularity '{granularity}'")
        return mapping[granularity]

    def partition_condition(self, field: str, start: str, end: str, fmt: str) -> str:
        return f"{field} >= '{start}' AND {field} <= '{end}'"

    def latest_partition_expr(self, table: str) -> str:
        return f"(SELECT MAX(ds) FROM {table})"

    def default_limit(self) -> int:
        return 50000
