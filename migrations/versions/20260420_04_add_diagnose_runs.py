"""add semantic diagnose runs (B-back-9)

Revision ID: 20260420_04
Revises: 20260420_03
Create Date: 2026-04-20

Plan: docs/superpowers/plans/2026-04-20-platform-redesign/02-backend-workstream.md §B-back-9
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_04"
down_revision = "20260420_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "semantic_diagnose_runs" not in inspector.get_table_names():
        op.create_table(
            "semantic_diagnose_runs",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("input_kind", sa.String(length=32), nullable=False),
            sa.Column("input_text", sa.Text(), nullable=False),
            sa.Column("parse_ok", sa.Boolean(), nullable=True),
            sa.Column("validate_ok", sa.Boolean(), nullable=True),
            sa.Column("sql_text", sa.Text(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Index("idx_diagnose_runs_user_time", "user_id", "created_at"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "semantic_diagnose_runs" in inspector.get_table_names():
        op.drop_table("semantic_diagnose_runs")
