import pytest

from app.application.query_execution.sql_guard import SqlGuard
from app.shared.exceptions import InvalidSQLError


def test_sql_guard_adds_default_limit_for_normal_query():
    guard = SqlGuard(default_limit=50000)

    result = guard.validate("SELECT id FROM student_comments")

    assert result.validated_sql == "SELECT id FROM student_comments LIMIT 50000"
    assert result.applied_limit == 50000


def test_sql_guard_preserves_existing_limit():
    guard = SqlGuard(default_limit=50000)

    result = guard.validate("SELECT id FROM student_comments LIMIT 10")

    assert result.validated_sql == "SELECT id FROM student_comments LIMIT 10"
    assert result.applied_limit is None


def test_sql_guard_does_not_apply_default_limit_for_export_mode():
    guard = SqlGuard(default_limit=50000)

    result = guard.validate("SELECT id FROM student_comments", result_mode="export")

    assert result.validated_sql == "SELECT id FROM student_comments"
    assert result.applied_limit is None


@pytest.mark.parametrize(
    "sql",
    [
        "",
        "-- just a comment",
        "SELECT 1; SELECT 2",
        "DROP TABLE student_comments",
        "INSERT OVERWRITE TABLE target SELECT * FROM source",
        "WITH bad AS (DELETE FROM t) SELECT * FROM bad",
    ],
)
def test_sql_guard_rejects_unsafe_sql(sql):
    guard = SqlGuard(default_limit=50000)

    with pytest.raises(InvalidSQLError):
        guard.validate(sql)

