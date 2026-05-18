from __future__ import annotations

import re
from dataclasses import dataclass

import sqlparse

from app.shared.exceptions import InvalidSQLError


_WRITE_PATTERNS = (
    r"\binsert\s+overwrite\b",
    r"\binsert\b",
    r"\bupdate\b",
    r"\bdelete\b",
    r"\bmerge\b",
    r"\bdrop\b",
    r"\btruncate\b",
    r"\balter\b",
    r"\bcreate\b",
    r"\breplace\b",
    r"\bgrant\b",
    r"\brevoke\b",
)


@dataclass(frozen=True)
class SqlGuardResult:
    """SQL Guard 校验结果。"""

    original_sql: str
    validated_sql: str
    applied_limit: int | None = None


class SqlGuard:
    """执行面 readonly SQL 兜底校验。"""

    def __init__(self, *, default_limit: int = 50000):
        self.default_limit = default_limit

    def validate(self, sql: str, *, result_mode: str = "preview") -> SqlGuardResult:
        stripped = self._strip_comments(sql)
        if not stripped:
            raise InvalidSQLError("SQL 不能为空")

        statements = [stmt for stmt in sqlparse.parse(stripped) if str(stmt).strip()]
        if len(statements) != 1:
            raise InvalidSQLError("只允许提交单条 SQL")

        normalized = " ".join(stripped.lower().split())
        if not (normalized.startswith("select ") or normalized.startswith("with ")):
            raise InvalidSQLError("仅支持 SELECT 查询")

        if self._contains_write_operation(normalized):
            raise InvalidSQLError("查询包含写操作或危险语法")

        validated_sql = stripped.rstrip(";").strip()
        applied_limit = None
        if result_mode != "export" and not self._has_limit(normalized):
            validated_sql = f"{validated_sql} LIMIT {self.default_limit}"
            applied_limit = self.default_limit

        return SqlGuardResult(
            original_sql=sql,
            validated_sql=validated_sql,
            applied_limit=applied_limit,
        )

    def _strip_comments(self, sql: str) -> str:
        return sqlparse.format(sql or "", strip_comments=True).strip()

    def _contains_write_operation(self, normalized_sql: str) -> bool:
        return any(re.search(pattern, normalized_sql) for pattern in _WRITE_PATTERNS)

    def _has_limit(self, normalized_sql: str) -> bool:
        return re.search(r"\blimit\s+\d+\b", normalized_sql) is not None

