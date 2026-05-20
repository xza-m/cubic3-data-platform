from __future__ import annotations

from scripts.checks.semantic_alembic_baseline import (
    DEFAULT_REQUIRED_SCHEMA,
    build_schema_fingerprint,
    check_schema_fingerprint,
)


def test_semantic_baseline_fingerprint_reports_missing_registry_table():
    schema = {
        table_name: {
            "columns": set(definition["columns"]),
            "indexes": set(definition.get("indexes", ())),
        }
        for table_name, definition in DEFAULT_REQUIRED_SCHEMA.items()
        if table_name != "semantic_runtime_snapshots"
    }

    problems = check_schema_fingerprint(schema)

    assert {
        "type": "missing_table",
        "table": "semantic_runtime_snapshots",
    } in problems


def test_semantic_baseline_fingerprint_reports_missing_column_and_index():
    schema = {
        table_name: {
            "columns": set(definition["columns"]),
            "indexes": set(definition.get("indexes", ())),
        }
        for table_name, definition in DEFAULT_REQUIRED_SCHEMA.items()
    }
    schema["semantic_assets"]["columns"].remove("current_revision_id")
    schema["semantic_runtime_snapshots"]["indexes"].remove(
        "uq_semantic_runtime_snapshots_active_namespace"
    )

    problems = check_schema_fingerprint(schema)

    assert {
        "type": "missing_column",
        "table": "semantic_assets",
        "column": "current_revision_id",
    } in problems
    assert {
        "type": "missing_index",
        "table": "semantic_runtime_snapshots",
        "index": "uq_semantic_runtime_snapshots_active_namespace",
    } in problems


def test_semantic_baseline_fingerprint_is_stable_for_equivalent_schema():
    schema_a = {
        "semantic_assets": {
            "columns": {"id", "asset_key", "namespace"},
            "indexes": {"uq_semantic_assets_namespace_type_key"},
        }
    }
    schema_b = {
        "semantic_assets": {
            "columns": {"namespace", "id", "asset_key"},
            "indexes": {"uq_semantic_assets_namespace_type_key"},
        }
    }

    assert build_schema_fingerprint(schema_a) == build_schema_fingerprint(schema_b)
