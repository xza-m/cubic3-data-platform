"""add agent runtime artifact storage metadata

Revision ID: 0006_agent_runtime_artifacts
Revises: 0005_agent_runtime_management
Create Date: 2026-05-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0006_agent_runtime_artifacts"
down_revision = "0005_agent_runtime_management"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return table_name in set(sa.inspect(op.get_bind()).get_table_names())


def _existing_columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {item["name"] for item in inspector.get_columns(table_name)}


def _existing_indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {item["name"] for item in inspector.get_indexes(table_name)}


def _add_column_if_missing(
    *,
    table_name: str,
    column: sa.Column,
) -> None:
    if column.name not in _existing_columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(
    *,
    index_name: str,
    table_name: str,
    columns: list[str],
) -> None:
    if index_name not in _existing_indexes(table_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(*, index_name: str, table_name: str) -> None:
    if _table_exists(table_name) and index_name in _existing_indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    table_name = "agent_inference_runtime_artifacts"
    if not _table_exists(table_name):
        return
    _add_column_if_missing(
        table_name=table_name,
        column=sa.Column("storage_uri", sa.Text(), nullable=True),
    )
    _add_column_if_missing(
        table_name=table_name,
        column=sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    _add_column_if_missing(
        table_name=table_name,
        column=sa.Column("download_name", sa.String(length=255), nullable=True),
    )
    _create_index_if_missing(
        index_name="idx_agent_runtime_artifacts_expires",
        table_name=table_name,
        columns=["expires_at"],
    )


def downgrade() -> None:
    table_name = "agent_inference_runtime_artifacts"
    if not _table_exists(table_name):
        return
    _drop_index_if_exists(
        index_name="idx_agent_runtime_artifacts_expires",
        table_name=table_name,
    )
    existing_columns = _existing_columns(table_name)
    for column_name in ("download_name", "expires_at", "storage_uri"):
        if column_name in existing_columns:
            op.drop_column(table_name, column_name)
