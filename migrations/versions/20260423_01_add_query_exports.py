"""add query_exports table

Revision ID: 20260423_01
Revises: 20260422_02
Create Date: 2026-04-23

异步数据导出任务持久化：记录任务生命周期、结果文件元信息、过期状态。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260423_01"
down_revision = "20260422_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "query_exports" in existing:
        return

    op.create_table(
        "query_exports",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("source_id", sa.BigInteger(), nullable=True),
        sa.Column("sql_query", sa.Text(), nullable=False),
        sa.Column("visual_spec", sa.JSON(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("file_storage", sa.String(length=16), nullable=True),
        sa.Column("file_object_key", sa.String(length=512), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("job_id", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "idx_query_exports_user_created",
        "query_exports",
        ["user_id", "created_at"],
    )
    op.create_index(
        "idx_query_exports_status_created",
        "query_exports",
        ["status", "created_at"],
    )
    op.create_index(
        "idx_query_exports_status_expires",
        "query_exports",
        ["status", "expires_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "query_exports" not in inspector.get_table_names():
        return
    for idx in (
        "idx_query_exports_status_expires",
        "idx_query_exports_status_created",
        "idx_query_exports_user_created",
    ):
        try:
            op.drop_index(idx, table_name="query_exports")
        except Exception:  # pragma: no cover - tolerate missing indexes
            pass
    op.drop_table("query_exports")
