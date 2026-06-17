"""平台 Token Pair 会话与 SSO 授权码

Revision ID: 0014_platform_token_pair
Revises: 0013_api_key_semantic_pin
Create Date: 2026-06-16
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision = "0014_platform_token_pair"
down_revision = "0013_api_key_semantic_pin"
branch_labels = None
depends_on = None

_BIG_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def _has_table(table: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("auth_refresh_sessions"):
        op.create_table(
            "auth_refresh_sessions",
            sa.Column("session_id", sa.String(length=64), primary_key=True),
            sa.Column("token_family_id", sa.String(length=64), nullable=False),
            sa.Column(
                "principal_id",
                sa.String(length=191),
                sa.ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_name", sa.String(length=128), nullable=True),
            sa.Column("roles", _JSON, nullable=False),
            sa.Column("refresh_token_hash", sa.String(length=128), nullable=False, unique=True),
            sa.Column("auth_method", sa.String(length=32), nullable=False),
            sa.Column("client_type", sa.String(length=32), nullable=False, server_default="web"),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("revoke_reason", sa.String(length=64), nullable=True),
            sa.Column("replaced_by_session_id", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_auth_refresh_sessions_principal", "auth_refresh_sessions", ["principal_id"])
        op.create_index("idx_auth_refresh_sessions_family", "auth_refresh_sessions", ["token_family_id"])
        op.create_index("idx_auth_refresh_sessions_hash", "auth_refresh_sessions", ["refresh_token_hash"])
        op.create_index(
            "idx_auth_refresh_sessions_status",
            "auth_refresh_sessions",
            ["revoked_at", "expires_at"],
        )

    if not _has_table("auth_authorization_codes"):
        op.create_table(
            "auth_authorization_codes",
            sa.Column("code_id", sa.String(length=64), primary_key=True),
            sa.Column("code_hash", sa.String(length=128), nullable=False, unique=True),
            sa.Column(
                "principal_id",
                sa.String(length=191),
                sa.ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_name", sa.String(length=128), nullable=True),
            sa.Column("roles", _JSON, nullable=False),
            sa.Column("client_type", sa.String(length=32), nullable=False, server_default="web"),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_auth_authorization_codes_hash", "auth_authorization_codes", ["code_hash"])
        op.create_index("idx_auth_authorization_codes_principal", "auth_authorization_codes", ["principal_id"])
        op.create_index("idx_auth_authorization_codes_expires", "auth_authorization_codes", ["expires_at"])


def downgrade() -> None:
    if _has_table("auth_authorization_codes"):
        op.drop_table("auth_authorization_codes")
    if _has_table("auth_refresh_sessions"):
        op.drop_table("auth_refresh_sessions")
