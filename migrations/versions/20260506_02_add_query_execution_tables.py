"""add query execution tables

Revision ID: 20260506_02
Revises: 20260501_01
Create Date: 2026-05-06

统一查询执行面：持久化异步查询 job、执行事件和结果对象。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260506_02"
down_revision = "20260501_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "query_execution_jobs" not in existing:
        op.create_table(
            "query_execution_jobs",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column("trace_id", sa.String(length=64), nullable=False),
            sa.Column("principal_id", sa.String(length=128), nullable=False),
            sa.Column("route_type", sa.String(length=64), nullable=False),
            sa.Column("semantic_plan_id", sa.String(length=128), nullable=True),
            sa.Column("source_id", sa.BigInteger(), nullable=False),
            sa.Column("project_name", sa.String(length=255), nullable=True),
            sa.Column("logical_sql", sa.Text(), nullable=False),
            sa.Column("validated_sql", sa.Text(), nullable=False),
            sa.Column("sql_hash", sa.String(length=128), nullable=False),
            sa.Column("resource_set_json", sa.JSON(), nullable=False),
            sa.Column("data_level", sa.String(length=32), nullable=False, server_default="M1"),
            sa.Column("ticket_snapshot_json", sa.JSON(), nullable=False),
            sa.Column("governance_snapshot_json", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="QUEUED"),
            sa.Column("idempotency_key", sa.String(length=128), nullable=True),
            sa.Column("engine_query_id", sa.String(length=128), nullable=True),
            sa.Column("lease_owner", sa.String(length=128), nullable=True),
            sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
            sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_code", sa.String(length=64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint(
                "principal_id",
                "idempotency_key",
                name="uq_query_execution_jobs_principal_idempotency",
            ),
        )
        op.create_index("ix_query_execution_jobs_trace_id", "query_execution_jobs", ["trace_id"])
        op.create_index("ix_query_execution_jobs_semantic_plan_id", "query_execution_jobs", ["semantic_plan_id"])
        op.create_index("ix_query_execution_jobs_status", "query_execution_jobs", ["status"])
        op.create_index("ix_query_execution_jobs_engine_query_id", "query_execution_jobs", ["engine_query_id"])
        op.create_index("ix_query_execution_jobs_lease_expires_at", "query_execution_jobs", ["lease_expires_at"])
        op.create_index(
            "idx_query_execution_jobs_status_lease_created",
            "query_execution_jobs",
            ["status", "lease_expires_at", "created_at"],
        )
        op.create_index(
            "idx_query_execution_jobs_principal_created",
            "query_execution_jobs",
            ["principal_id", "created_at"],
        )
        op.create_index("idx_query_execution_jobs_sql_hash", "query_execution_jobs", ["sql_hash"])

    existing = set(sa.inspect(bind).get_table_names())
    if "query_execution_events" not in existing:
        op.create_table(
            "query_execution_events",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "query_id",
                sa.String(length=64),
                sa.ForeignKey("query_execution_jobs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("from_status", sa.String(length=32), nullable=True),
            sa.Column("to_status", sa.String(length=32), nullable=True),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index(
            "idx_query_execution_events_query_created",
            "query_execution_events",
            ["query_id", "created_at"],
        )

    existing = set(sa.inspect(bind).get_table_names())
    if "query_result_objects" not in existing:
        op.create_table(
            "query_result_objects",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "query_id",
                sa.String(length=64),
                sa.ForeignKey("query_execution_jobs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
            sa.Column("storage_type", sa.String(length=32), nullable=False, server_default="local"),
            sa.Column("content_type", sa.String(length=128), nullable=False, server_default="text/csv"),
            sa.Column("file_path", sa.Text(), nullable=True),
            sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("byte_size", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("sha256", sa.String(length=128), nullable=True),
            sa.Column("preview_json", sa.JSON(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("ready_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("query_id", name="uq_query_result_objects_query_id"),
        )
        op.create_index(
            "idx_query_result_objects_status_expires",
            "query_result_objects",
            ["status", "expires_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "query_result_objects" in existing:
        op.drop_index("idx_query_result_objects_status_expires", table_name="query_result_objects")
        op.drop_table("query_result_objects")
    if "query_execution_events" in existing:
        op.drop_index("idx_query_execution_events_query_created", table_name="query_execution_events")
        op.drop_table("query_execution_events")
    if "query_execution_jobs" in existing:
        for index_name in (
            "idx_query_execution_jobs_sql_hash",
            "idx_query_execution_jobs_principal_created",
            "idx_query_execution_jobs_status_lease_created",
            "ix_query_execution_jobs_lease_expires_at",
            "ix_query_execution_jobs_engine_query_id",
            "ix_query_execution_jobs_status",
            "ix_query_execution_jobs_semantic_plan_id",
            "ix_query_execution_jobs_trace_id",
        ):
            op.drop_index(index_name, table_name="query_execution_jobs")
        op.drop_table("query_execution_jobs")
