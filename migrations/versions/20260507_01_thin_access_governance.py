"""thin access governance legacy approval fields

Revision ID: 20260507_01
Revises: 20260506_01
Create Date: 2026-05-07
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260507_01"
down_revision = "20260506_01"
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
    if _has_column("access_data_policies", "approval_policy_code"):
        with op.batch_alter_table("access_data_policies") as batch_op:
            batch_op.drop_column("approval_policy_code")

    if _has_column("access_policy_decisions", "approval_required") and not _has_column(
        "access_policy_decisions",
        "governance_required",
    ):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.alter_column("approval_required", new_column_name="governance_required")

    if _has_column("access_policy_decisions", "approval_required"):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.drop_column("approval_required")

    if _has_table("access_policy_decisions") and not _has_column("access_policy_decisions", "governance_required"):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.add_column(
                sa.Column("governance_required", sa.Boolean(), nullable=False, server_default=sa.text("false"))
            )

    if _has_column("access_policy_decisions", "decision_type"):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.alter_column("decision_type", server_default="inline")


def downgrade() -> None:
    if _has_column("access_policy_decisions", "governance_required") and not _has_column(
        "access_policy_decisions",
        "approval_required",
    ):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.alter_column("governance_required", new_column_name="approval_required")

    if _has_table("access_data_policies") and not _has_column("access_data_policies", "approval_policy_code"):
        with op.batch_alter_table("access_data_policies") as batch_op:
            batch_op.add_column(sa.Column("approval_policy_code", sa.String(length=64), nullable=True))

    if _has_column("access_policy_decisions", "decision_type"):
        with op.batch_alter_table("access_policy_decisions") as batch_op:
            batch_op.alter_column("decision_type", server_default="preview")
