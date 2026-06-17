"""expand actor identifier columns

Revision ID: 0009_expand_actor_ids
Revises: 0008_semantic_workbench
Create Date: 2026-06-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0009_expand_actor_ids"
down_revision = "0008_semantic_workbench"
branch_labels = None
depends_on = None


ACTOR_IDENTIFIER_LENGTH = 191

ACTOR_COLUMNS = [
    ("channels", "created_by"),
    ("subscriptions", "created_by"),
    ("agent_query_logs", "user_id"),
    ("conversations", "user_id"),
    ("data_sources", "created_by"),
    ("datasets", "created_by"),
    ("domain_publish_records", "published_by"),
    ("extraction_runs", "triggered_by"),
    ("extraction_tasks", "created_by"),
    ("extraction_templates", "created_by"),
    ("queries", "created_by"),
    ("query_exports", "user_id"),
    ("query_folders", "created_by"),
    ("query_histories", "executed_by"),
    ("query_templates", "created_by"),
    ("sql_queries", "created_by"),
    ("scheduled_queries", "owner_id"),
    ("governance_audit_traces", "principal_id"),
    ("agent_inference_runtime_runs", "principal_id"),
    ("agent_inference_runtime_artifacts", "principal_id"),
    ("agent_runtime_provider_configs", "updated_by"),
    ("agent_runtime_audit_logs", "principal_id"),
    ("semantic_assets", "owner_principal_id"),
    ("semantic_asset_revisions", "created_by"),
    ("semantic_releases", "published_by"),
    ("semantic_modeling_agent_sessions", "principal_id"),
    ("semantic_modeling_build_projects", "created_by"),
]


def _column_meta(table_name: str, column_name: str) -> dict | None:
    inspector = sa.inspect(op.get_bind())
    if table_name not in set(inspector.get_table_names()):
        return None
    for column in inspector.get_columns(table_name):
        if column["name"] == column_name:
            return column
    return None


def upgrade() -> None:
    for table_name, column_name in ACTOR_COLUMNS:
        column = _column_meta(table_name, column_name)
        if column is None:
            continue
        current_length = getattr(column["type"], "length", None)
        if current_length is not None and current_length >= ACTOR_IDENTIFIER_LENGTH:
            continue
        op.alter_column(
            table_name,
            column_name,
            existing_type=column["type"],
            type_=sa.String(length=ACTOR_IDENTIFIER_LENGTH),
            existing_nullable=column["nullable"],
        )


def downgrade() -> None:
    raise RuntimeError("actor identifier columns cannot be safely narrowed")
