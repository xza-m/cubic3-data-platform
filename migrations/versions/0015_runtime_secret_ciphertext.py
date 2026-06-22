"""Agent Runtime provider API Key 密文列

Revision ID: 0015_runtime_secret_ciphertext
Revises: 0014_platform_token_pair
Create Date: 2026-06-22

注：revision id 必须 <= alembic_version.version_num 的 varchar(32)。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0015_runtime_secret_ciphertext"
down_revision = "0014_platform_token_pair"
branch_labels = None
depends_on = None

_TABLE = "agent_runtime_provider_configs"
_COLUMN = "secret_ciphertext"


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def upgrade() -> None:
    if not _has_column(_TABLE, _COLUMN):
        op.add_column(_TABLE, sa.Column(_COLUMN, sa.Text(), nullable=True))


def downgrade() -> None:
    if _has_column(_TABLE, _COLUMN):
        op.drop_column(_TABLE, _COLUMN)
