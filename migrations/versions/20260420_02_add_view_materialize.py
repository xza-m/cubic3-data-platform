"""add semantic view materialize fields (B-back-3)

Revision ID: 20260420_02
Revises: 20260420_01
Create Date: 2026-04-20

Plan: docs/superpowers/plans/2026-04-20-platform-redesign/02-backend-workstream.md §B-back-3
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_02"
down_revision = "20260420_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "semantic_views" in inspector.get_table_names():
        existing = {col["name"] for col in inspector.get_columns("semantic_views")}
        if "materialized_at" not in existing:
            op.add_column(
                "semantic_views",
                sa.Column("materialized_at", sa.DateTime(), nullable=True),
            )
        if "materialize_status" not in existing:
            op.add_column(
                "semantic_views",
                sa.Column(
                    "materialize_status",
                    sa.String(length=16),
                    nullable=False,
                    server_default="idle",
                ),
            )

    if "semantic_view_materialize_runs" not in inspector.get_table_names():
        op.create_table(
            "semantic_view_materialize_runs",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("view_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Index("idx_view_mat_runs_view_started", "view_id", "started_at"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "semantic_view_materialize_runs" in inspector.get_table_names():
        op.drop_table("semantic_view_materialize_runs")

    if "semantic_views" in inspector.get_table_names():
        existing = {col["name"] for col in inspector.get_columns("semantic_views")}
        if "materialize_status" in existing:
            op.drop_column("semantic_views", "materialize_status")
        if "materialized_at" in existing:
            op.drop_column("semantic_views", "materialized_at")
