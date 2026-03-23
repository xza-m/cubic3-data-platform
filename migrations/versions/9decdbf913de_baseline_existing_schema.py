"""baseline existing schema

Revision ID: 9decdbf913de
Revises:
Create Date: 2026-03-16 16:50:00
"""

from __future__ import annotations


# revision identifiers, used by Alembic.
revision = "9decdbf913de"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 当前仓库在补齐 migrations 之前，数据库已经存在一套历史结构。
    # 这里将现有线上/本地库的状态标记为基线，后续迁移从这个 revision 继续演进。
    pass


def downgrade() -> None:
    # 基线 revision 不做 destructive 回滚。
    pass
