"""access gateway boundary policy epoch

Revision ID: 20260512_01
Revises: 20260507_01
Create Date: 2026-05-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260512_01"
down_revision = "20260507_01"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in set(sa.inspect(bind).get_table_names())


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns(table_name)}
    return column_name in columns


def upgrade() -> None:
    if _has_table("access_data_policies") and not _has_column("access_data_policies", "policy_epoch"):
        with op.batch_alter_table("access_data_policies") as batch_op:
            batch_op.add_column(sa.Column("policy_epoch", sa.Integer(), nullable=False, server_default="1"))

    if _has_table("access_policy_decisions") and not _has_column("access_policy_decisions", "policy_epoch"):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.add_column(sa.Column("policy_epoch", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    if _has_column("access_policy_decisions", "policy_epoch"):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.drop_column("policy_epoch")

    if _has_column("access_data_policies", "policy_epoch"):
        with op.batch_alter_table("access_data_policies") as batch_op:
            batch_op.drop_column("policy_epoch")
