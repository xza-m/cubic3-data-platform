"""add agent runtime management config and audit tables

Revision ID: 0005_agent_runtime_management
Revises: 0004_instance_heartbeats
Create Date: 2026-05-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.shared import db_types


revision = "0005_agent_runtime_management"
down_revision = "0004_instance_heartbeats"
branch_labels = None
depends_on = None


def _existing_indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {item["name"] for item in inspector.get_indexes(table_name)}


def _create_index_if_missing(
    *,
    index_name: str,
    table_name: str,
    columns: list[str],
) -> None:
    if index_name not in _existing_indexes(table_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(*, index_name: str, table_name: str) -> None:
    table_exists = table_name in set(sa.inspect(op.get_bind()).get_table_names())
    if table_exists and index_name in _existing_indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "agent_runtime_provider_configs" not in existing:
        op.create_table(
            "agent_runtime_provider_configs",
            sa.Column("runtime_name", sa.String(length=64), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("endpoint", sa.String(length=512), nullable=True),
            sa.Column("model", sa.String(length=255), nullable=True),
            sa.Column("secret_ref", sa.String(length=255), nullable=True),
            sa.Column("extra_json", db_types.JsonType(), nullable=False),
            sa.Column("updated_by", sa.String(length=128), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("runtime_name"),
        )
        existing.add("agent_runtime_provider_configs")

    if "agent_runtime_audit_logs" not in existing:
        op.create_table(
            "agent_runtime_audit_logs",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("runtime_name", sa.String(length=64), nullable=False),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("principal_id", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("metadata_json", db_types.JsonType(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        existing.add("agent_runtime_audit_logs")

    if "agent_runtime_audit_logs" in existing:
        _create_index_if_missing(
            index_name="idx_agent_runtime_audit_runtime_created",
            table_name="agent_runtime_audit_logs",
            columns=["runtime_name", "created_at"],
        )


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "agent_runtime_audit_logs" in existing:
        _drop_index_if_exists(
            index_name="idx_agent_runtime_audit_runtime_created",
            table_name="agent_runtime_audit_logs",
        )
        op.drop_table("agent_runtime_audit_logs")
    if "agent_runtime_provider_configs" in existing:
        op.drop_table("agent_runtime_provider_configs")
