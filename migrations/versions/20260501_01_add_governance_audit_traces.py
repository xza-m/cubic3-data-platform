"""add governance audit traces table

Revision ID: 20260501_01
Revises: 20260428_01
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260501_01"
down_revision = "20260428_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "governance_audit_traces" in existing:
        return

    op.create_table(
        "governance_audit_traces",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_name", sa.String(length=255), nullable=False),
        sa.Column("principal_id", sa.String(length=128), nullable=True),
        sa.Column("semantic_plan_id", sa.String(length=128), nullable=True),
        sa.Column("sql_hash", sa.String(length=128), nullable=True),
        sa.Column("gateway_query_id", sa.String(length=128), nullable=True),
        sa.Column("maxcompute_task_id", sa.String(length=128), nullable=True),
        sa.Column("viewer_roles", sa.JSON(), nullable=False),
        sa.Column("route_type", sa.String(length=64), nullable=False, server_default="direct"),
        sa.Column("execution_target", sa.String(length=64), nullable=False),
        sa.Column("decision", sa.String(length=64), nullable=False),
        sa.Column("policy", sa.JSON(), nullable=True),
        sa.Column("policy_decision", sa.JSON(), nullable=False),
        sa.Column("traceability", sa.JSON(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column_name in (
        "target_type",
        "target_name",
        "principal_id",
        "semantic_plan_id",
        "sql_hash",
        "gateway_query_id",
        "maxcompute_task_id",
        "route_type",
        "decision",
        "timestamp",
    ):
        op.create_index(
            f"idx_governance_audit_traces_{column_name}",
            "governance_audit_traces",
            [column_name],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "governance_audit_traces" not in existing:
        return

    for column_name in (
        "timestamp",
        "decision",
        "route_type",
        "maxcompute_task_id",
        "gateway_query_id",
        "sql_hash",
        "semantic_plan_id",
        "principal_id",
        "target_name",
        "target_type",
    ):
        op.drop_index(
            f"idx_governance_audit_traces_{column_name}",
            table_name="governance_audit_traces",
        )
    op.drop_table("governance_audit_traces")
