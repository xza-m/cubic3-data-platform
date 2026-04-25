"""add user preferences (B-back-1)

Revision ID: 20260420_01
Revises: 20260316_01
Create Date: 2026-04-20

Plan: docs/superpowers/plans/2026-04-20-platform-redesign/02-backend-workstream.md §B-back-1
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_01"
down_revision = "20260316_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_preferences" in inspector.get_table_names():
        return

    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("theme", sa.String(length=16), nullable=False, server_default="system"),
        sa.Column(
            "default_landing",
            sa.String(length=128),
            nullable=False,
            server_default="/dashboard",
        ),
        sa.Column("list_page_size", sa.Integer(), nullable=False, server_default="20"),
        sa.Column(
            "table_density",
            sa.String(length=16),
            nullable=False,
            server_default="comfortable",
        ),
        sa.Column("extra", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        # NOTE: 历史上这里有一条 FK `fk_user_preferences_user → users(id)`，
        # 但 users 表要到 20260420_05 才被创建，迁移链会在这里 UndefinedTable。
        # 领域实体 `UserPreferences` 本身并未声明该 FK，与迁移原本就不一致；
        # 2026-04-25 修复：删除该 FK 约束让迁移链能一次性跑通；如需引入外键，
        # 请在 users 表创建后的新 revision 中用 op.create_foreign_key 补。
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
