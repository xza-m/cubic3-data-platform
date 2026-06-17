"""M1/M2 收敛：release 状态机字段 + Agent 工具链 evidence

- semantic_releases.status_reason / status_changed_at：deprecate / revoke 原因与时间
- 历史数据收敛：每个 namespace 仅保留最新 published release，其余 published 落为 superseded
- agent_query_log.tool_trace：Agent Loop 工具调用轨迹与降级原因（通道优先级合约 evidence）

Revision ID: 0011_release_state_machine
Revises: 0010_diagnose_def_hash
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision = "0011_release_state_machine"
down_revision = "0010_diagnose_def_hash"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    if not _has_column("semantic_releases", "status_reason"):
        op.add_column(
            "semantic_releases",
            sa.Column("status_reason", sa.String(length=512), nullable=True),
        )
    if not _has_column("semantic_releases", "status_changed_at"):
        op.add_column(
            "semantic_releases",
            sa.Column("status_changed_at", sa.DateTime(), nullable=True),
        )
    if not _has_column("agent_query_log", "tool_trace"):
        op.add_column(
            "agent_query_log",
            sa.Column("tool_trace", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=True),
        )

    # 显式状态机收敛：每 namespace 仅保留最新 published，其余 published → superseded
    op.execute(
        sa.text(
            """
            UPDATE semantic_releases
            SET status = 'superseded', status_changed_at = CURRENT_TIMESTAMP
            WHERE status = 'published'
              AND id NOT IN (
                  SELECT sr.id
                  FROM semantic_releases sr
                  JOIN (
                      SELECT namespace, MAX(release_no) AS max_no
                      FROM semantic_releases
                      WHERE status = 'published'
                      GROUP BY namespace
                  ) latest
                  ON sr.namespace = latest.namespace AND sr.release_no = latest.max_no
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("UPDATE semantic_releases SET status = 'published' WHERE status = 'superseded'")
    )
    op.drop_column("semantic_releases", "status_changed_at")
    op.drop_column("semantic_releases", "status_reason")
    op.drop_column("agent_query_log", "tool_trace")
