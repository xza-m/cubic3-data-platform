"""add scheduled queries (B-back-8)

Revision ID: 20260420_03
Revises: 20260420_02
Create Date: 2026-04-20

Plan: docs/superpowers/plans/2026-04-20-platform-redesign/02-backend-workstream.md §B-back-8
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_03"
down_revision = "20260420_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "scheduled_queries" not in inspector.get_table_names():
        op.create_table(
            "scheduled_queries",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("sql", sa.Text(), nullable=False),
            sa.Column("datasource_id", sa.BigInteger(), nullable=False),
            sa.Column("cron", sa.String(length=64), nullable=False),
            sa.Column(
                "timezone",
                sa.String(length=64),
                nullable=False,
                server_default="Asia/Shanghai",
            ),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("next_run_at", sa.DateTime(), nullable=True),
            sa.Column("last_run_at", sa.DateTime(), nullable=True),
            sa.Column("last_status", sa.String(length=16), nullable=True),
            sa.Column("owner_id", sa.BigInteger(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Index("idx_scheduled_queries_owner", "owner_id"),
            sa.Index(
                "idx_scheduled_queries_enabled_next", "enabled", "next_run_at"
            ),
        )

    if "scheduled_query_runs" not in inspector.get_table_names():
        op.create_table(
            "scheduled_query_runs",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("query_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("rows_returned", sa.Integer(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ["query_id"],
                ["scheduled_queries.id"],
                ondelete="CASCADE",
                name="fk_scheduled_query_runs_query",
            ),
            sa.Index("idx_scheduled_query_runs_query_started", "query_id", "started_at"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "scheduled_query_runs" in inspector.get_table_names():
        op.drop_table("scheduled_query_runs")
    if "scheduled_queries" in inspector.get_table_names():
        op.drop_table("scheduled_queries")
