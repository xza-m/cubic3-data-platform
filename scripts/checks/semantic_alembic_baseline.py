#!/usr/bin/env python3
"""语义生产 baseline schema fingerprint 检查。"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Mapping

from sqlalchemy import create_engine, inspect


DEFAULT_REQUIRED_SCHEMA: dict[str, dict[str, tuple[str, ...]]] = {
    "alembic_version": {"columns": ("version_num",), "indexes": ()},
    "semantic_modeling_agent_sessions": {
        "columns": (
            "id",
            "principal_id",
            "status",
            "state",
            "state_version",
            "payload_json",
            "version",
        ),
        "indexes": ("idx_semantic_modeling_sessions_principal_updated",),
    },
    "semantic_modeling_proposals": {
        "columns": ("id", "status", "payload_json", "version"),
        "indexes": ("idx_semantic_modeling_proposals_status_updated",),
    },
    "governance_audit_traces": {
        "columns": ("id", "target_type", "principal_id", "decision", "traceability"),
        "indexes": ("ix_governance_audit_traces_principal_id",),
    },
    "semantic_assets": {
        "columns": (
            "id",
            "namespace",
            "asset_type",
            "asset_key",
            "status",
            "current_revision_id",
            "current_release_id",
            "source_kind",
        ),
        "indexes": ("uq_semantic_assets_namespace_type_key",),
    },
    "semantic_asset_revisions": {
        "columns": (
            "id",
            "asset_id",
            "revision_no",
            "revision_status",
            "spec_json",
            "spec_checksum",
        ),
        "indexes": ("uq_semantic_asset_revisions_asset_revision_no",),
    },
    "semantic_asset_dependencies": {
        "columns": (
            "id",
            "asset_revision_id",
            "depends_on_asset_id",
            "depends_on_revision_id",
            "dependency_type",
            "required",
        ),
        "indexes": ("idx_semantic_asset_dependencies_revision",),
    },
    "semantic_releases": {
        "columns": (
            "id",
            "release_no",
            "namespace",
            "status",
            "scope_json",
            "gate_result_json",
            "idempotency_key",
        ),
        "indexes": ("uq_semantic_releases_namespace_release_no",),
    },
    "semantic_release_assets": {
        "columns": ("release_id", "asset_id", "revision_id", "asset_type", "asset_key"),
        "indexes": ("idx_semantic_release_assets_asset",),
    },
    "semantic_runtime_snapshots": {
        "columns": (
            "id",
            "release_id",
            "namespace",
            "status",
            "asset_manifest_json",
            "binding_manifest_json",
            "policy_manifest_json",
        ),
        "indexes": ("uq_semantic_runtime_snapshots_active_namespace",),
    },
}


def inspect_database_schema(database_url: str) -> dict[str, dict[str, set[str]]]:
    engine = create_engine(database_url)
    inspector = inspect(engine)
    schema: dict[str, dict[str, set[str]]] = {}
    for table_name in inspector.get_table_names():
        schema[table_name] = {
            "columns": {column["name"] for column in inspector.get_columns(table_name)},
            "indexes": {index["name"] for index in inspector.get_indexes(table_name)},
        }
        for constraint in inspector.get_unique_constraints(table_name):
            name = constraint.get("name")
            if name:
                schema[table_name]["indexes"].add(name)
    engine.dispose()
    return schema


def check_schema_fingerprint(
    schema: Mapping[str, Mapping[str, set[str] | list[str] | tuple[str, ...]]],
    *,
    required_schema: Mapping[str, Mapping[str, tuple[str, ...]]] = DEFAULT_REQUIRED_SCHEMA,
) -> list[dict[str, str]]:
    problems: list[dict[str, str]] = []
    for table_name, required in required_schema.items():
        actual = schema.get(table_name)
        if actual is None:
            problems.append({"type": "missing_table", "table": table_name})
            continue
        actual_columns = set(actual.get("columns", ()))
        actual_indexes = set(actual.get("indexes", ()))
        for column in required.get("columns", ()):
            if column not in actual_columns:
                problems.append({"type": "missing_column", "table": table_name, "column": column})
        for index in required.get("indexes", ()):
            if index not in actual_indexes:
                problems.append({"type": "missing_index", "table": table_name, "index": index})
    return problems


def build_schema_fingerprint(
    schema: Mapping[str, Mapping[str, set[str] | list[str] | tuple[str, ...]]],
) -> dict[str, str]:
    canonical = _canonical_schema_json(schema)
    return {
        "canonical_json": canonical,
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def _canonical_schema_json(
    schema: Mapping[str, Mapping[str, set[str] | list[str] | tuple[str, ...]]],
) -> str:
    normalized: dict[str, dict[str, list[str]]] = {}
    for table_name in sorted(schema):
        definition = schema[table_name]
        normalized[table_name] = {
            "columns": sorted(definition.get("columns", ())),
            "indexes": sorted(definition.get("indexes", ())),
        }
    return json.dumps(normalized, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    schema = inspect_database_schema(args.database_url)
    problems = check_schema_fingerprint(schema)
    fingerprint = build_schema_fingerprint(schema)
    report: dict[str, Any] = {
        "ok": not problems,
        "problems": problems,
        "fingerprint": fingerprint,
    }
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"[semantic-alembic-baseline] sha256={fingerprint['sha256']}")
        if problems:
            print("[semantic-alembic-baseline] fingerprint mismatch", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
        else:
            print("[semantic-alembic-baseline] fingerprint OK")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
