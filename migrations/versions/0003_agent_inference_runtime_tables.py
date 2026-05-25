"""add agent inference runtime trace tables

Revision ID: 0003_agent_inference_runtime_tables
Revises: 0002_data_asset_tables
Create Date: 2026-05-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.shared import db_types


revision = "0003_agent_inference_runtime_tables"
down_revision = "0002_data_asset_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "agent_inference_runtime_runs" not in existing:
        op.create_table(
            "agent_inference_runtime_runs",
            sa.Column("run_id", sa.String(length=128), nullable=False),
            sa.Column("app_id", sa.String(length=128), nullable=False),
            sa.Column("action", sa.String(length=255), nullable=False),
            sa.Column("runtime_name", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("project_id", sa.String(length=128), nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("thread_id", sa.String(length=128), nullable=False),
            sa.Column("turn_id", sa.String(length=128), nullable=False),
            sa.Column("principal_id", sa.String(length=128), nullable=True),
            sa.Column("provider_ref_json", db_types.JsonType(), nullable=True),
            sa.Column("usage_json", db_types.JsonType(), nullable=False),
            sa.Column("error_json", db_types.JsonType(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("run_id"),
        )
        op.create_index(
            "idx_agent_runtime_runs_app_action_created",
            "agent_inference_runtime_runs",
            ["app_id", "action", "created_at"],
            unique=False,
        )
        op.create_index(
            "idx_agent_runtime_runs_principal_created",
            "agent_inference_runtime_runs",
            ["principal_id", "created_at"],
            unique=False,
        )
        op.create_index(
            "idx_agent_runtime_runs_context",
            "agent_inference_runtime_runs",
            ["project_id", "session_id", "thread_id", "turn_id"],
            unique=False,
        )

    if "agent_inference_runtime_artifacts" not in existing:
        op.create_table(
            "agent_inference_runtime_artifacts",
            sa.Column("artifact_id", sa.String(length=128), nullable=False),
            sa.Column("run_id", sa.String(length=128), nullable=False),
            sa.Column("app_id", sa.String(length=128), nullable=False),
            sa.Column("principal_id", sa.String(length=128), nullable=True),
            sa.Column("project_id", sa.String(length=128), nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("thread_id", sa.String(length=128), nullable=False),
            sa.Column("turn_id", sa.String(length=128), nullable=False),
            sa.Column("artifact_type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("mime_type", sa.String(length=128), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("sha256", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("artifact_id"),
        )
        op.create_index(
            "idx_agent_runtime_artifacts_run_created",
            "agent_inference_runtime_artifacts",
            ["run_id", "created_at"],
            unique=False,
        )
        op.create_index(
            "idx_agent_runtime_artifacts_owner_run",
            "agent_inference_runtime_artifacts",
            ["principal_id", "run_id"],
            unique=False,
        )
        op.create_index(
            "idx_agent_runtime_artifacts_context",
            "agent_inference_runtime_artifacts",
            ["project_id", "session_id", "thread_id", "turn_id"],
            unique=False,
        )


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "agent_inference_runtime_artifacts" in existing:
        op.drop_index(
            "idx_agent_runtime_artifacts_context",
            table_name="agent_inference_runtime_artifacts",
        )
        op.drop_index(
            "idx_agent_runtime_artifacts_owner_run",
            table_name="agent_inference_runtime_artifacts",
        )
        op.drop_index(
            "idx_agent_runtime_artifacts_run_created",
            table_name="agent_inference_runtime_artifacts",
        )
        op.drop_table("agent_inference_runtime_artifacts")
    if "agent_inference_runtime_runs" in existing:
        op.drop_index(
            "idx_agent_runtime_runs_context",
            table_name="agent_inference_runtime_runs",
        )
        op.drop_index(
            "idx_agent_runtime_runs_principal_created",
            table_name="agent_inference_runtime_runs",
        )
        op.drop_index(
            "idx_agent_runtime_runs_app_action_created",
            table_name="agent_inference_runtime_runs",
        )
        op.drop_table("agent_inference_runtime_runs")
