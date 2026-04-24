"""add domain_publish_records and user_login_events tables (B-6 / B-8)

Revision ID: 20260422_02
Revises: 20260422_01
Create Date: 2026-04-22

新增两张轻量审计表：
* ``domain_publish_records``: 语义域每次发布的快照（B-6 发布历史）。
* ``user_login_events``: 用户登录事件流（B-8 登录历史）。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260422_02"
down_revision = "20260422_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "domain_publish_records" not in existing:
        op.create_table(
            "domain_publish_records",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("domain_id", sa.String(length=128), nullable=False),
            sa.Column("domain_code", sa.String(length=128), nullable=True),
            sa.Column("version", sa.String(length=32), nullable=False),
            sa.Column(
                "status",
                sa.String(length=16),
                nullable=False,
                server_default="success",
            ),
            sa.Column("published_by", sa.String(length=128), nullable=True),
            sa.Column("diff_summary", sa.Text(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("snapshot", sa.JSON(), nullable=True),
            sa.Column(
                "published_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index(
            "idx_domain_pub_records_domain_id",
            "domain_publish_records",
            ["domain_id"],
        )
        op.create_index(
            "idx_domain_pub_records_published_at",
            "domain_publish_records",
            ["published_at"],
        )

    if "user_login_events" not in existing:
        op.create_table(
            "user_login_events",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column(
                "status",
                sa.String(length=16),
                nullable=False,
                server_default="success",
            ),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=512), nullable=True),
            sa.Column("error_reason", sa.String(length=255), nullable=True),
            sa.Column(
                "logged_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
                ondelete="CASCADE",
                name="fk_user_login_events_user",
            ),
        )
        op.create_index(
            "idx_user_login_events_user_id",
            "user_login_events",
            ["user_id"],
        )
        op.create_index(
            "idx_user_login_events_logged_at",
            "user_login_events",
            ["logged_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "user_login_events" in existing:
        op.drop_index("idx_user_login_events_logged_at", table_name="user_login_events")
        op.drop_index("idx_user_login_events_user_id", table_name="user_login_events")
        op.drop_table("user_login_events")

    if "domain_publish_records" in existing:
        op.drop_index(
            "idx_domain_pub_records_published_at",
            table_name="domain_publish_records",
        )
        op.drop_index(
            "idx_domain_pub_records_domain_id",
            table_name="domain_publish_records",
        )
        op.drop_table("domain_publish_records")
