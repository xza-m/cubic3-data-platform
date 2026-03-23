"""formalize semantic registry

Revision ID: 20260316_01
Revises:
Create Date: 2026-03-16 16:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260316_01"
down_revision = "9decdbf913de"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_name = "semantic_registry_entries"

    if table_name not in inspector.get_table_names():
        op.create_table(
            table_name,
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("object_type", sa.String(length=32), nullable=False),
            sa.Column("object_name", sa.String(length=128), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=True),
            sa.Column("definition_hash", sa.String(length=128), nullable=True),
            sa.Column("last_loaded_at", sa.DateTime(), nullable=True),
            sa.Column("publish_status", sa.String(length=32), nullable=True),
            sa.Column("last_published_at", sa.DateTime(), nullable=True),
            sa.Column("last_drift_status", sa.String(length=32), nullable=True),
            sa.Column("last_drift_checked_at", sa.DateTime(), nullable=True),
            sa.Column("measure_summary_snapshot", sa.JSON(), nullable=True),
            sa.Column("certified_measure_list", sa.JSON(), nullable=True),
            sa.Column("lineage_summary", sa.JSON(), nullable=True),
            sa.Column("source_binding_summary", sa.JSON(), nullable=True),
            sa.Column("domain_fingerprint", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("object_type", "object_name", name="uq_semantic_registry_object"),
        )
        return

    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    desired_columns = {
        "source_id": sa.Column("source_id", sa.Integer(), nullable=True),
        "status": sa.Column("status", sa.String(length=32), nullable=True),
        "definition_hash": sa.Column("definition_hash", sa.String(length=128), nullable=True),
        "last_loaded_at": sa.Column("last_loaded_at", sa.DateTime(), nullable=True),
        "publish_status": sa.Column("publish_status", sa.String(length=32), nullable=True),
        "last_published_at": sa.Column("last_published_at", sa.DateTime(), nullable=True),
        "last_drift_status": sa.Column("last_drift_status", sa.String(length=32), nullable=True),
        "last_drift_checked_at": sa.Column("last_drift_checked_at", sa.DateTime(), nullable=True),
        "measure_summary_snapshot": sa.Column("measure_summary_snapshot", sa.JSON(), nullable=True),
        "certified_measure_list": sa.Column("certified_measure_list", sa.JSON(), nullable=True),
        "lineage_summary": sa.Column("lineage_summary", sa.JSON(), nullable=True),
        "source_binding_summary": sa.Column("source_binding_summary", sa.JSON(), nullable=True),
        "domain_fingerprint": sa.Column("domain_fingerprint", sa.String(length=128), nullable=True),
        "created_at": sa.Column("created_at", sa.DateTime(), nullable=True),
        "updated_at": sa.Column("updated_at", sa.DateTime(), nullable=True),
    }
    for column_name, column in desired_columns.items():
        if column_name not in existing_columns:
            op.add_column(table_name, column)

    unique_constraints = {item["name"] for item in inspector.get_unique_constraints(table_name)}
    if "uq_semantic_registry_object" not in unique_constraints:
        op.create_unique_constraint("uq_semantic_registry_object", table_name, ["object_type", "object_name"])


def downgrade() -> None:
    # 收敛期迁移不对已有 registry 数据做 destructive 回滚。
    pass
