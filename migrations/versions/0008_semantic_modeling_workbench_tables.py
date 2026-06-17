"""add semantic modeling workbench tables

Revision ID: 0008_semantic_workbench
Revises: 0007_drop_query_execution_tables
Create Date: 2026-06-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.shared import db_types


revision = "0008_semantic_workbench"
down_revision = "0007_drop_query_execution_tables"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return table_name in set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if not _table_exists("semantic_modeling_build_projects"):
        op.create_table(
            "semantic_modeling_build_projects",
            sa.Column("id", sa.String(length=128), nullable=False),
            sa.Column("created_by", sa.String(length=191), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("payload_json", db_types.JsonType(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_semantic_build_projects_principal_updated",
            "semantic_modeling_build_projects",
            ["created_by", "updated_at"],
            unique=False,
        )
        op.create_index(
            "idx_semantic_build_projects_status_updated",
            "semantic_modeling_build_projects",
            ["status", "updated_at"],
            unique=False,
        )

    if not _table_exists("semantic_modeling_asset_packages"):
        op.create_table(
            "semantic_modeling_asset_packages",
            sa.Column("id", sa.String(length=160), nullable=False),
            sa.Column("project_id", sa.String(length=128), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("risk", sa.String(length=32), nullable=False),
            sa.Column("payload_json", db_types.JsonType(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_semantic_asset_packages_project_status",
            "semantic_modeling_asset_packages",
            ["project_id", "status"],
            unique=False,
        )
        op.create_index(
            "idx_semantic_asset_packages_risk",
            "semantic_modeling_asset_packages",
            ["risk"],
            unique=False,
        )


def downgrade() -> None:
    if _table_exists("semantic_modeling_asset_packages"):
        op.drop_index(
            "idx_semantic_asset_packages_risk",
            table_name="semantic_modeling_asset_packages",
        )
        op.drop_index(
            "idx_semantic_asset_packages_project_status",
            table_name="semantic_modeling_asset_packages",
        )
        op.drop_table("semantic_modeling_asset_packages")

    if _table_exists("semantic_modeling_build_projects"):
        op.drop_index(
            "idx_semantic_build_projects_status_updated",
            table_name="semantic_modeling_build_projects",
        )
        op.drop_index(
            "idx_semantic_build_projects_principal_updated",
            table_name="semantic_modeling_build_projects",
        )
        op.drop_table("semantic_modeling_build_projects")
