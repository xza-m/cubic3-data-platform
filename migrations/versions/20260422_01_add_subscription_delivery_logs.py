"""add subscription_delivery_logs table (B-2)

Revision ID: 20260422_01
Revises: 20260420_05
Create Date: 2026-04-22

Adds the ``subscription_delivery_logs`` table used by DeliveryService to record
every dispatch attempt. Consumed by the v2 UI through
``GET /api/v1/subscriptions/:id/history``.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260422_01"
down_revision = "20260420_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "subscription_delivery_logs" in set(inspector.get_table_names()):
        return

    op.create_table(
        "subscription_delivery_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("subscription_id", sa.BigInteger(), nullable=False),
        sa.Column("channel_id", sa.BigInteger(), nullable=True),
        sa.Column("event_type", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "trigger_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["subscriptions.id"],
            ondelete="CASCADE",
            name="fk_sub_delivery_logs_subscription",
        ),
    )
    op.create_index(
        "idx_sub_delivery_logs_subscription_id",
        "subscription_delivery_logs",
        ["subscription_id"],
    )
    op.create_index(
        "idx_sub_delivery_logs_trigger_at",
        "subscription_delivery_logs",
        ["trigger_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "subscription_delivery_logs" not in set(inspector.get_table_names()):
        return
    op.drop_index(
        "idx_sub_delivery_logs_trigger_at",
        table_name="subscription_delivery_logs",
    )
    op.drop_index(
        "idx_sub_delivery_logs_subscription_id",
        table_name="subscription_delivery_logs",
    )
    op.drop_table("subscription_delivery_logs")
