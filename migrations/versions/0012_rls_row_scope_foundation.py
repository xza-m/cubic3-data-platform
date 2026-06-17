"""M3 RLS 平台侧基础：row_scope 模板 + PrincipalDataScope + 决策 effective_row_scope

- access_data_policies.row_scope：行级谓词模板（JSON 数组）
- access_principal_scopes：Principal 数据范围属性（manual / issuance / feishu_dept）
- access_policy_decisions.effective_row_scope：post_compile 求值结果持久化

Revision ID: 0012_rls_row_scope_foundation
Revises: 0011_release_state_machine
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision = "0012_rls_row_scope_foundation"
down_revision = "0011_release_state_machine"
branch_labels = None
depends_on = None

_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column in {col["name"] for col in inspector.get_columns(table)}


def _has_table(table: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table in inspector.get_table_names()


def upgrade() -> None:
    if not _has_column("access_data_policies", "row_scope"):
        op.add_column(
            "access_data_policies",
            sa.Column("row_scope", _JSON, nullable=True),
        )
    if not _has_column("access_policy_decisions", "effective_row_scope"):
        op.add_column(
            "access_policy_decisions",
            sa.Column("effective_row_scope", _JSON, nullable=True),
        )
    if not _has_table("access_principal_scopes"):
        op.create_table(
            "access_principal_scopes",
            sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
            sa.Column(
                "principal_id",
                sa.String(length=191),
                sa.ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("attribute", sa.String(length=128), nullable=False),
            sa.Column("values", _JSON, nullable=False),
            sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
            sa.Column("synced_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.String(length=191), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint(
                "principal_id",
                "attribute",
                "source",
                name="uq_access_principal_scopes_attr_source",
            ),
        )
        op.create_index(
            "idx_access_principal_scopes_principal",
            "access_principal_scopes",
            ["principal_id"],
        )
        op.create_index(
            "idx_access_principal_scopes_attribute",
            "access_principal_scopes",
            ["attribute"],
        )


def downgrade() -> None:
    op.drop_table("access_principal_scopes")
    op.drop_column("access_policy_decisions", "effective_row_scope")
    op.drop_column("access_data_policies", "row_scope")
