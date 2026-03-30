"""
SQL 校验工具单元测试
"""
import pytest
from unittest.mock import MagicMock, patch

from app.shared.utils.sql_validator import (
    validate_sql_query,
    prepare_readonly_sql,
    _normalize_limit,
    format_sql,
    extract_table_names,
    DEFAULT_QUERY_LIMIT,
    MAX_QUERY_LIMIT,
)


class TestValidateSqlQuery:
    def test_valid_select(self):
        ok, errs = validate_sql_query("SELECT id FROM users")
        assert ok is True and errs == []

    def test_valid_cte(self):
        ok, _ = validate_sql_query("WITH t AS (SELECT 1) SELECT * FROM t")
        assert ok is True

    def test_empty_string(self):
        ok, errs = validate_sql_query("")
        assert ok is False
        assert "不能为空" in errs[0]

    def test_none_input(self):
        ok, _ = validate_sql_query(None)
        assert ok is False

    def test_multi_statement(self):
        ok, errs = validate_sql_query("SELECT 1; SELECT 2")
        assert ok is False
        assert "单条" in errs[0]

    def test_drop_blocked(self):
        ok, errs = validate_sql_query("DROP TABLE users")
        assert ok is False
        assert any("DROP" in e for e in errs)

    def test_delete_blocked(self):
        ok, errs = validate_sql_query("DELETE FROM users")
        assert ok is False

    def test_insert_blocked(self):
        ok, errs = validate_sql_query("INSERT INTO users VALUES (1)")
        assert ok is False

    def test_update_blocked(self):
        ok, errs = validate_sql_query("UPDATE users SET name='x'")
        assert ok is False

    def test_unmatched_parens(self):
        ok, errs = validate_sql_query("SELECT (id FROM users")
        assert ok is False
        assert any("括号" in e for e in errs)

    def test_non_select_statement(self):
        ok, errs = validate_sql_query("GRANT ALL ON users TO admin")
        assert ok is False

    def test_comment_only_sql_is_rejected(self):
        ok, errs = validate_sql_query("-- only comment")
        assert ok is False
        assert any("无法解析 SQL 语句" in err or "移除注释后" in err for err in errs)

    def test_dangerous_keyword_inside_string_literal_is_allowed(self):
        ok, errs = validate_sql_query("SELECT 'DROP TABLE users' AS sql_text")
        assert ok is True
        assert errs == []

    def test_parse_exception_is_reported(self):
        with patch("app.shared.utils.sql_validator.sqlparse.parse", side_effect=RuntimeError("bad parse")):
            ok, errs = validate_sql_query("SELECT 1")

        assert ok is False
        assert errs == ["SQL 解析错误: bad parse"]

    def test_sql_with_only_comments_after_parse_is_rejected(self):
        stmt = MagicMock()
        stmt.token_first.side_effect = [object(), None]
        with patch("app.shared.utils.sql_validator.sqlparse.parse", return_value=[stmt]):
            ok, errs = validate_sql_query("/* comment */")

        assert ok is False
        assert errs == ["SQL 语句为空（移除注释后）"]


class TestPrepareReadonlySql:
    def test_basic_select(self):
        result = prepare_readonly_sql("SELECT 1")
        assert result == "SELECT 1"

    def test_strips_semicolon(self):
        result = prepare_readonly_sql("SELECT 1;")
        assert not result.endswith(";")

    def test_injects_limit(self):
        result = prepare_readonly_sql("SELECT id FROM t", limit=50)
        assert "LIMIT 50" in result

    def test_preserves_existing_limit(self):
        result = prepare_readonly_sql("SELECT id FROM t LIMIT 10", limit=50)
        assert result.count("LIMIT") == 1

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="不能为空"):
            prepare_readonly_sql("")

    def test_invalid_sql_raises(self):
        with pytest.raises(ValueError):
            prepare_readonly_sql("DROP TABLE users")

    def test_no_limit_param(self):
        result = prepare_readonly_sql("SELECT 1", limit=None)
        assert "LIMIT" not in result

    def test_limit_is_normalized_when_non_numeric(self):
        result = prepare_readonly_sql("SELECT id FROM t", limit="oops")
        assert result.endswith(f"LIMIT {DEFAULT_QUERY_LIMIT}")


class TestNormalizeLimit:
    def test_normal(self):
        assert _normalize_limit(100) == 100

    def test_none(self):
        assert _normalize_limit(None) == DEFAULT_QUERY_LIMIT

    def test_zero(self):
        assert _normalize_limit(0) == DEFAULT_QUERY_LIMIT

    def test_negative(self):
        assert _normalize_limit(-5) == DEFAULT_QUERY_LIMIT

    def test_exceeds_max(self):
        assert _normalize_limit(999999) == MAX_QUERY_LIMIT

    def test_invalid_type(self):
        assert _normalize_limit("abc") == DEFAULT_QUERY_LIMIT


class TestFormatSql:
    def test_basic_format(self):
        result = format_sql("select id from users")
        assert "SELECT" in result

    def test_invalid_sql_returns_original(self):
        original = ""
        result = format_sql(original)
        assert result == original

    def test_formatter_exception_returns_original(self):
        with patch("app.shared.utils.sql_validator.sqlparse.format", side_effect=RuntimeError("boom")):
            assert format_sql("select 1") == "select 1"


class TestExtractTableNames:
    def test_returns_list(self):
        result = extract_table_names("SELECT id FROM users")
        assert isinstance(result, list)
        assert "users" in result

    def test_empty_sql(self):
        assert extract_table_names("") == []

    def test_invalid_sql(self):
        assert extract_table_names(None) == []

    def test_extracts_joined_table_names_without_duplicates(self):
        result = extract_table_names(
            "SELECT * FROM users u JOIN orders o ON u.id = o.user_id JOIN users uu ON uu.id = o.user_id"
        )
        assert sorted(result) == ["orders", "users"]
