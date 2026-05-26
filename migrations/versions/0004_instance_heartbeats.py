"""add app instance heartbeat table

Revision ID: 0004_instance_heartbeats
Revises: 0003_agent_runtime_tables
Create Date: 2026-05-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0004_instance_heartbeats"
down_revision = "0003_agent_runtime_tables"
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
    if "instance_heartbeats" not in existing:
        op.create_table(
            "instance_heartbeats",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("instance_id", sa.BigInteger(), nullable=False),
            sa.Column("beat_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["instance_id"], ["app_instances.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        existing.add("instance_heartbeats")

    if "instance_heartbeats" in existing:
        _create_index_if_missing(
            index_name="idx_instance_heartbeats_instance_beat",
            table_name="instance_heartbeats",
            columns=["instance_id", "beat_at"],
        )


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "instance_heartbeats" in existing:
        _drop_index_if_exists(
            index_name="idx_instance_heartbeats_instance_beat",
            table_name="instance_heartbeats",
        )
        op.drop_table("instance_heartbeats")
