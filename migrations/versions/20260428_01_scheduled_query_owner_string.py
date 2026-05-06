"""make scheduled query owner id string

Revision ID: 20260428_01
Revises: 20260423_01
Create Date: 2026-04-28

``auth`` 的 user_id 合同是字符串，飞书 open_id 也会作为 user_id 写入 JWT。
调度查询归属字段跟随认证合同，避免 PostgreSQL 在列表过滤时把 open_id 当 bigint
比较导致页面 500。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260428_01"
down_revision = "20260423_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "scheduled_queries" not in inspector.get_table_names():
        return

    columns = {col["name"]: col for col in inspector.get_columns("scheduled_queries")}
    owner = columns.get("owner_id")
    if owner is None or isinstance(owner["type"], sa.String):
        return

    with op.batch_alter_table("scheduled_queries") as batch_op:
        batch_op.alter_column(
            "owner_id",
            existing_type=sa.BigInteger(),
            type_=sa.String(length=128),
            existing_nullable=False,
            postgresql_using="owner_id::text",
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "scheduled_queries" not in inspector.get_table_names():
        return

    columns = {col["name"]: col for col in inspector.get_columns("scheduled_queries")}
    owner = columns.get("owner_id")
    if owner is None or isinstance(owner["type"], sa.BigInteger):
        return

    with op.batch_alter_table("scheduled_queries") as batch_op:
        batch_op.alter_column(
            "owner_id",
            existing_type=sa.String(length=128),
            type_=sa.BigInteger(),
            existing_nullable=False,
            postgresql_using=(
                "CASE WHEN owner_id ~ '^[0-9]+$' THEN owner_id::bigint ELSE NULL END"
            ),
        )
