"""M3 Wave 5：API Key 语义 release pin 配置

- access_api_keys.semantic_pin：消费方 pin 配置
  （{"pin_policy": "pinned"|"track_active", "release_id": "..."}）

Revision ID: 0013_api_key_semantic_pin
Revises: 0012_rls_row_scope_foundation
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision = "0013_api_key_semantic_pin"
down_revision = "0012_rls_row_scope_foundation"
branch_labels = None
depends_on = None

_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    if not _has_column("access_api_keys", "semantic_pin"):
        op.add_column(
            "access_api_keys",
            sa.Column("semantic_pin", _JSON, nullable=True),
        )


def downgrade() -> None:
    op.drop_column("access_api_keys", "semantic_pin")
