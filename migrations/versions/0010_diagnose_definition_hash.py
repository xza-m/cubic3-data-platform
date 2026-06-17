"""Phase 3/5 收尾：诊断历史定义版本标识 + 消息来源标注

- semantic_diagnose_runs.definition_hash：诊断时刻语义定义集版本标识
- messages.source：AI 回答来源（semantic | agent | legacy_llm）

Revision ID: 0010_diagnose_def_hash
Revises: 0009_expand_actor_ids
Create Date: 2026-06-10
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0010_diagnose_def_hash"
down_revision = "0009_expand_actor_ids"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    if not _has_column("semantic_diagnose_runs", "definition_hash"):
        op.add_column(
            "semantic_diagnose_runs",
            sa.Column("definition_hash", sa.String(length=128), nullable=True),
        )
    if not _has_column("messages", "source"):
        op.add_column(
            "messages",
            sa.Column("source", sa.String(length=32), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("semantic_diagnose_runs", "definition_hash")
    op.drop_column("messages", "source")
