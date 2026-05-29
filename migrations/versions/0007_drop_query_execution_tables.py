"""drop query execution tables

Revision ID: 0007_drop_query_execution_tables
Revises: 0006_agent_runtime_artifact_storage
Create Date: 2026-05-29
"""

from __future__ import annotations

from alembic import op


revision = "0007_drop_query_execution_tables"
down_revision = "0006_agent_runtime_artifact_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("query_result_objects")
    op.drop_table("query_execution_events")
    op.drop_table("query_execution_jobs")


def downgrade() -> None:
    raise RuntimeError("query_execution tables are retired and cannot be recreated by downgrade")
