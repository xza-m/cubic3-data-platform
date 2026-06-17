"""row_scope 模板校验与求值单元测试。"""
from __future__ import annotations

from types import SimpleNamespace

from app.application.governance.row_scope import (
    build_catalog_dimension_resolver,
    build_cube_repository_dimension_resolver,
    evaluate_row_scope_templates,
    validate_row_scope_templates,
)


class _CubeRepoStub:
    def __init__(self, cube):
        self._cube = cube

    def get(self, name):
        return self._cube if name == "comment_reports" else None


def _comment_cube():
    return SimpleNamespace(
        table="dw.dwd_comment_reports",
        dimensions={"school_id": SimpleNamespace(sql="{CUBE}.school_id")},
    )


class TestDimensionResolver:
    def test_cube_repository_resolver_resolves_table_and_column(self):
        resolver = build_cube_repository_dimension_resolver(_CubeRepoStub(_comment_cube()))
        assert resolver("comment_reports.school_id") == {
            "table": "dw.dwd_comment_reports",
            "column": "school_id",
        }

    def test_none_repository_returns_none_resolver(self):
        assert build_cube_repository_dimension_resolver(None) is None

    def test_catalog_resolver_delegates_to_cube_repository(self):
        catalog = SimpleNamespace(cube_repository=_CubeRepoStub(_comment_cube()))
        resolver = build_catalog_dimension_resolver(catalog)
        assert resolver("comment_reports.school_id")["column"] == "school_id"
        assert build_catalog_dimension_resolver(None) is None


class TestValidateRowScopeTemplates:
    def test_none_returns_empty(self):
        normalized, error = validate_row_scope_templates(None)
        assert normalized == []
        assert error is None

    def test_valid_template_normalized_with_defaults(self):
        normalized, error = validate_row_scope_templates(
            [{"dimension_ref": "comment_reports.school_id", "attribute": "school_ids"}]
        )
        assert error is None
        assert normalized == [
            {
                "dimension_ref": "comment_reports.school_id",
                "operator": "in",
                "attribute": "school_ids",
                "on_missing": "deny",
            }
        ]

    def test_rejects_non_list(self):
        _, error = validate_row_scope_templates({"dimension_ref": "a.b"})
        assert error == "row_scope 必须是数组"

    def test_rejects_bad_dimension_ref(self):
        _, error = validate_row_scope_templates([{"dimension_ref": "no_dot", "attribute": "x"}])
        assert "dimension_ref" in error

    def test_rejects_bad_operator(self):
        _, error = validate_row_scope_templates(
            [{"dimension_ref": "a.b", "attribute": "x", "operator": "like"}]
        )
        assert "operator" in error

    def test_rejects_missing_attribute(self):
        _, error = validate_row_scope_templates([{"dimension_ref": "a.b"}])
        assert "attribute" in error

    def test_rejects_bad_on_missing(self):
        _, error = validate_row_scope_templates(
            [{"dimension_ref": "a.b", "attribute": "x", "on_missing": "allow"}]
        )
        assert "on_missing" in error


class TestEvaluateRowScopeTemplates:
    TEMPLATE = {
        "dimension_ref": "comment_reports.school_id",
        "operator": "in",
        "attribute": "school_ids",
        "on_missing": "deny",
    }

    @staticmethod
    def _resolver(dimension_ref: str):
        if dimension_ref == "comment_reports.school_id":
            return {"table": "dw.dwd_comment_reports", "column": "school_id"}
        return None

    def test_evaluates_to_concrete_values(self):
        entries, deny = evaluate_row_scope_templates(
            templates=[self.TEMPLATE],
            data_scopes={"school_ids": ["s_001", "s_002"]},
            policy_code="m2_detail_read",
            dimension_resolver=self._resolver,
        )
        assert deny is None
        assert entries == [
            {
                "table": "dw.dwd_comment_reports",
                "column": "school_id",
                "operator": "in",
                "values": ["s_001", "s_002"],
                "policy_code": "m2_detail_read",
                "dimension_ref": "comment_reports.school_id",
                "attribute": "school_ids",
            }
        ]

    def test_missing_attribute_with_on_missing_deny_fails_closed(self):
        entries, deny = evaluate_row_scope_templates(
            templates=[self.TEMPLATE],
            data_scopes={},
            policy_code="m2_detail_read",
            dimension_resolver=self._resolver,
        )
        assert entries == []
        assert deny == "row_scope_unresolved"

    def test_missing_attribute_with_on_missing_unrestricted_skips(self):
        template = {**self.TEMPLATE, "on_missing": "unrestricted"}
        entries, deny = evaluate_row_scope_templates(
            templates=[template],
            data_scopes={},
            policy_code="m2_detail_read",
            dimension_resolver=self._resolver,
        )
        assert entries == []
        assert deny is None

    def test_unresolvable_dimension_ref_fails_closed(self):
        template = {**self.TEMPLATE, "dimension_ref": "unknown_cube.col"}
        entries, deny = evaluate_row_scope_templates(
            templates=[template],
            data_scopes={"school_ids": ["s_001"]},
            policy_code="m2_detail_read",
            dimension_resolver=self._resolver,
        )
        assert entries == []
        assert deny == "row_scope_unresolved"

    def test_eq_operator_with_multiple_values_widens_to_in(self):
        template = {**self.TEMPLATE, "operator": "eq"}
        entries, deny = evaluate_row_scope_templates(
            templates=[template],
            data_scopes={"school_ids": ["s_001", "s_002"]},
            policy_code="m2_detail_read",
            dimension_resolver=self._resolver,
        )
        assert deny is None
        assert entries[0]["operator"] == "in"
