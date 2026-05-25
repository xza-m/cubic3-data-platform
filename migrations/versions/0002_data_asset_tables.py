"""add data asset foundation tables

Revision ID: 0002_data_asset_tables
Revises: 0001_initial_schema
Create Date: 2026-05-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.shared import db_types


revision = "0002_data_asset_tables"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "data_asset_tables" not in existing:
        op.create_table(
            "data_asset_tables",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("source_id", sa.String(length=128), nullable=False),
            sa.Column("database", sa.String(length=191), nullable=False),
            sa.Column("schema", sa.String(length=191), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("layer", sa.String(length=64), nullable=True),
            sa.Column("owner", sa.String(length=128), nullable=True),
            sa.Column("table_type", sa.String(length=64), nullable=False),
            sa.Column("lifecycle_status", sa.String(length=32), nullable=False),
            sa.Column("row_count", sa.Integer(), nullable=True),
            sa.Column("partition_count", sa.Integer(), nullable=True),
            sa.Column("field_count", sa.Integer(), nullable=False),
            sa.Column("profile_status", sa.String(length=32), nullable=False),
            sa.Column("sync_status", sa.String(length=32), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(), nullable=True),
            sa.Column("last_profiled_at", sa.DateTime(), nullable=True),
            sa.Column("extra_json", db_types.JsonType(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "source_id",
                "database",
                "schema",
                "name",
                name="uq_data_asset_tables_source_database_schema_name",
            ),
        )
        op.create_index(
            "idx_data_asset_tables_source_layer",
            "data_asset_tables",
            ["source_id", "layer"],
            unique=False,
        )
        op.create_index(
            "idx_data_asset_tables_sync_profile",
            "data_asset_tables",
            ["sync_status", "profile_status"],
            unique=False,
        )

    if "data_asset_fields" not in existing:
        op.create_table(
            "data_asset_fields",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("table_id", sa.String(length=128), nullable=False),
            sa.Column("source_id", sa.String(length=128), nullable=False),
            sa.Column("database", sa.String(length=191), nullable=False),
            sa.Column("schema", sa.String(length=191), nullable=True),
            sa.Column("table_name", sa.String(length=255), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("data_type", sa.Text(), nullable=False),
            sa.Column("ordinal", sa.Integer(), nullable=False),
            sa.Column("nullable", sa.Boolean(), nullable=False),
            sa.Column("comment", sa.String(length=1024), nullable=True),
            sa.Column("profile_json", db_types.JsonType(), nullable=False),
            sa.Column("sensitivity_level", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("table_id", "name", name="uq_data_asset_fields_table_name"),
        )
        op.create_index(
            "idx_data_asset_fields_table_ordinal",
            "data_asset_fields",
            ["table_id", "ordinal"],
            unique=False,
        )

    if "data_asset_snapshots" not in existing:
        op.create_table(
            "data_asset_snapshots",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("table_id", sa.String(length=128), nullable=False),
            sa.Column("snapshot_type", sa.String(length=32), nullable=False),
            sa.Column("payload_json", db_types.JsonType(), nullable=False),
            sa.Column("sync_run_id", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_data_asset_snapshots_sync_run",
            "data_asset_snapshots",
            ["sync_run_id"],
            unique=False,
        )
        op.create_index(
            "idx_data_asset_snapshots_table_type_created",
            "data_asset_snapshots",
            ["table_id", "snapshot_type", "created_at"],
            unique=False,
        )

    if "data_asset_sync_runs" not in existing:
        op.create_table(
            "data_asset_sync_runs",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("source_id", sa.String(length=128), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("error_message", sa.String(length=1024), nullable=True),
            sa.Column("stats_json", db_types.JsonType(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_data_asset_sync_runs_source_started",
            "data_asset_sync_runs",
            ["source_id", "started_at"],
            unique=False,
        )
        op.create_index(
            "idx_data_asset_sync_runs_status",
            "data_asset_sync_runs",
            ["status"],
            unique=False,
        )

    if "data_asset_usage" not in existing:
        op.create_table(
            "data_asset_usage",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("table_id", sa.String(length=128), nullable=False),
            sa.Column("field_id", sa.String(length=128), nullable=True),
            sa.Column("source_type", sa.String(length=64), nullable=False),
            sa.Column("source_ref", sa.String(length=255), nullable=False),
            sa.Column("usage_count", sa.Integer(), nullable=False),
            sa.Column("last_used_at", sa.DateTime(), nullable=False),
            sa.Column("metadata_json", db_types.JsonType(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_data_asset_usage_last_used",
            "data_asset_usage",
            ["last_used_at"],
            unique=False,
        )
        op.create_index(
            "idx_data_asset_usage_table_source",
            "data_asset_usage",
            ["table_id", "source_type"],
            unique=False,
        )

    if "data_asset_lineage" not in existing:
        op.create_table(
            "data_asset_lineage",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("source_table_id", sa.String(length=128), nullable=False),
            sa.Column("target_table_id", sa.String(length=128), nullable=True),
            sa.Column("target_type", sa.String(length=64), nullable=False),
            sa.Column("target_ref", sa.String(length=255), nullable=False),
            sa.Column("relation_type", sa.String(length=32), nullable=False),
            sa.Column("metadata_json", db_types.JsonType(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_data_asset_lineage_source",
            "data_asset_lineage",
            ["source_table_id", "relation_type"],
            unique=False,
        )
        op.create_index(
            "idx_data_asset_lineage_target",
            "data_asset_lineage",
            ["target_type", "target_ref"],
            unique=False,
        )


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "data_asset_lineage" in existing:
        op.drop_index("idx_data_asset_lineage_target", table_name="data_asset_lineage")
        op.drop_index("idx_data_asset_lineage_source", table_name="data_asset_lineage")
        op.drop_table("data_asset_lineage")
    if "data_asset_usage" in existing:
        op.drop_index("idx_data_asset_usage_table_source", table_name="data_asset_usage")
        op.drop_index("idx_data_asset_usage_last_used", table_name="data_asset_usage")
        op.drop_table("data_asset_usage")
    if "data_asset_sync_runs" in existing:
        op.drop_index("idx_data_asset_sync_runs_status", table_name="data_asset_sync_runs")
        op.drop_index("idx_data_asset_sync_runs_source_started", table_name="data_asset_sync_runs")
        op.drop_table("data_asset_sync_runs")
    if "data_asset_snapshots" in existing:
        op.drop_index("idx_data_asset_snapshots_table_type_created", table_name="data_asset_snapshots")
        op.drop_index("idx_data_asset_snapshots_sync_run", table_name="data_asset_snapshots")
        op.drop_table("data_asset_snapshots")
    if "data_asset_fields" in existing:
        op.drop_index("idx_data_asset_fields_table_ordinal", table_name="data_asset_fields")
        op.drop_table("data_asset_fields")
    if "data_asset_tables" in existing:
        op.drop_index("idx_data_asset_tables_sync_profile", table_name="data_asset_tables")
        op.drop_index("idx_data_asset_tables_source_layer", table_name="data_asset_tables")
        op.drop_table("data_asset_tables")
