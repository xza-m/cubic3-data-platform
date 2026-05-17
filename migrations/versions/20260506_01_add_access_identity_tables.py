"""add access identity tables

Revision ID: 20260506_01
Revises: 20260501_01
Create Date: 2026-05-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260506_01"
down_revision = "20260501_01"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in set(sa.inspect(bind).get_table_names())


def upgrade() -> None:
    if not _has_table("access_principals"):
        op.create_table(
            "access_principals",
            sa.Column("principal_id", sa.String(length=191), primary_key=True),
            sa.Column("principal_type", sa.String(length=32), nullable=False),
            sa.Column("idp", sa.String(length=32), nullable=False),
            sa.Column("tenant_key", sa.String(length=128), nullable=False),
            sa.Column("display_name", sa.String(length=128), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("employee_no", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("raw_profile", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_access_principals_type", "access_principals", ["principal_type"])
        op.create_index("idx_access_principals_tenant", "access_principals", ["tenant_key"])
        op.create_index("idx_access_principals_status", "access_principals", ["status"])

    if not _has_table("access_principal_aliases"):
        op.create_table(
            "access_principal_aliases",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("principal_id", sa.String(length=191), nullable=False),
            sa.Column("idp", sa.String(length=32), nullable=False),
            sa.Column("tenant_key", sa.String(length=128), nullable=False),
            sa.Column("external_id_type", sa.String(length=32), nullable=False),
            sa.Column("external_id", sa.String(length=191), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["principal_id"], ["access_principals.principal_id"], ondelete="CASCADE"),
            sa.UniqueConstraint(
                "idp",
                "tenant_key",
                "external_id_type",
                "external_id",
                name="uq_access_principal_alias_external",
            ),
        )
        op.create_index("idx_access_principal_aliases_principal", "access_principal_aliases", ["principal_id"])

    if not _has_table("access_service_principals"):
        op.create_table(
            "access_service_principals",
            sa.Column("principal_id", sa.String(length=191), primary_key=True),
            sa.Column("service_type", sa.String(length=32), nullable=False),
            sa.Column("owner_principal_id", sa.String(length=191), nullable=False),
            sa.Column("owner_team", sa.String(length=128), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("allowed_tenants", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("delegation_rules", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("disabled_at", sa.DateTime(), nullable=True),
            sa.Column("disabled_by", sa.String(length=191), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["principal_id"], ["access_principals.principal_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["owner_principal_id"], ["access_principals.principal_id"], ondelete="RESTRICT"),
        )
        op.create_index("idx_access_service_principals_type", "access_service_principals", ["service_type"])
        op.create_index("idx_access_service_principals_owner", "access_service_principals", ["owner_principal_id"])
        op.create_index("idx_access_service_principals_status", "access_service_principals", ["status"])

    if not _has_table("access_api_keys"):
        op.create_table(
            "access_api_keys",
            sa.Column("key_id", sa.String(length=64), primary_key=True),
            sa.Column("principal_id", sa.String(length=191), nullable=False),
            sa.Column("key_prefix", sa.String(length=128), nullable=False),
            sa.Column("key_hash", sa.String(length=128), nullable=False),
            sa.Column("scopes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("allowed_ips", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("rate_limit_per_minute", sa.Integer(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("last_rotated_at", sa.DateTime(), nullable=True),
            sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("created_by", sa.String(length=191), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["principal_id"], ["access_principals.principal_id"], ondelete="CASCADE"),
        )
        op.create_index("idx_access_api_keys_principal", "access_api_keys", ["principal_id"])
        op.create_index("idx_access_api_keys_status", "access_api_keys", ["status"])
        op.create_index("idx_access_api_keys_prefix", "access_api_keys", ["key_prefix"])

    if not _has_table("access_role_bindings"):
        op.create_table(
            "access_role_bindings",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("subject_type", sa.String(length=32), nullable=False),
            sa.Column("subject_key", sa.String(length=255), nullable=False),
            sa.Column("role_code", sa.String(length=64), nullable=False),
            sa.Column("role_type", sa.String(length=32), nullable=False),
            sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
            sa.Column("effective_from", sa.DateTime(), nullable=True),
            sa.Column("effective_to", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("created_by", sa.String(length=191), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint(
                "subject_type",
                "subject_key",
                "role_code",
                "role_type",
                "effective_from",
                name="uq_access_role_bindings_effective",
            ),
        )
        op.create_index("idx_access_role_bindings_subject", "access_role_bindings", ["subject_type", "subject_key"])
        op.create_index("idx_access_role_bindings_role", "access_role_bindings", ["role_type", "role_code"])
        op.create_index("idx_access_role_bindings_status", "access_role_bindings", ["status"])

    if not _has_table("access_delegation_events"):
        op.create_table(
            "access_delegation_events",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("actor_principal_id", sa.String(length=191), nullable=False),
            sa.Column("delegated_principal_id", sa.String(length=191), nullable=True),
            sa.Column("tenant_key", sa.String(length=128), nullable=True),
            sa.Column("message_id", sa.String(length=191), nullable=True),
            sa.Column("chat_id", sa.String(length=191), nullable=True),
            sa.Column("event_id", sa.String(length=191), nullable=True),
            sa.Column("endpoint", sa.String(length=255), nullable=True),
            sa.Column("decision", sa.String(length=32), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_access_delegation_events_actor", "access_delegation_events", ["actor_principal_id"])
        op.create_index("idx_access_delegation_events_delegated", "access_delegation_events", ["delegated_principal_id"])
        op.create_index("idx_access_delegation_events_message", "access_delegation_events", ["message_id"])
        op.create_index("idx_access_delegation_events_created", "access_delegation_events", ["created_at"])

    if not _has_table("access_principal_preferences"):
        op.create_table(
            "access_principal_preferences",
            sa.Column("principal_id", sa.String(length=191), primary_key=True),
            sa.Column("theme", sa.String(length=16), nullable=False, server_default="system"),
            sa.Column(
                "default_landing",
                sa.String(length=128),
                nullable=False,
                server_default="/dashboard",
            ),
            sa.Column("list_page_size", sa.Integer(), nullable=False, server_default="20"),
            sa.Column(
                "table_density",
                sa.String(length=16),
                nullable=False,
                server_default="comfortable",
            ),
            sa.Column("extra", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(
                ["principal_id"],
                ["access_principals.principal_id"],
                ondelete="CASCADE",
            ),
        )

    if not _has_table("access_execution_profiles"):
        op.create_table(
            "access_execution_profiles",
            sa.Column("profile_code", sa.String(length=64), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("credential_mode", sa.String(length=32), nullable=False),
            sa.Column("credential_ref", sa.String(length=255), nullable=True),
            sa.Column("data_level", sa.String(length=16), nullable=False, server_default="M1"),
            sa.Column("allowed_operations", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("max_rows", sa.Integer(), nullable=True),
            sa.Column("timeout_seconds", sa.Integer(), nullable=True),
            sa.Column("export_allowed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("requires_strong_audit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("created_by", sa.String(length=191), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_access_execution_profiles_status", "access_execution_profiles", ["status"])
        op.create_index("idx_access_execution_profiles_level", "access_execution_profiles", ["data_level"])

    if not _has_table("access_data_policies"):
        op.create_table(
            "access_data_policies",
            sa.Column("policy_code", sa.String(length=64), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("subject_roles", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("resource_scope", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("actions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("effect", sa.String(length=32), nullable=False, server_default="allow"),
            sa.Column("execution_profile_code", sa.String(length=64), nullable=True),
            sa.Column("approval_policy_code", sa.String(length=64), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("policy_version", sa.String(length=64), nullable=False, server_default="v1"),
            sa.Column("created_by", sa.String(length=191), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_access_data_policies_status", "access_data_policies", ["status"])
        op.create_index("idx_access_data_policies_priority", "access_data_policies", ["priority"])
        op.create_index("ix_access_data_policies_execution_profile_code", "access_data_policies", ["execution_profile_code"])

    if not _has_table("access_policy_decisions"):
        op.create_table(
            "access_policy_decisions",
            sa.Column("decision_id", sa.String(length=64), primary_key=True),
            sa.Column("principal_id", sa.String(length=191), nullable=False),
            sa.Column("actor_id", sa.String(length=191), nullable=True),
            sa.Column("decision", sa.String(length=32), nullable=False),
            sa.Column("reason_code", sa.String(length=64), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("data_level", sa.String(length=16), nullable=False),
            sa.Column("resource_set", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("sql_hashes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("matched_policies", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("execution_profile_code", sa.String(length=64), nullable=True),
            sa.Column("policy_version", sa.String(length=64), nullable=True),
            sa.Column("decision_type", sa.String(length=32), nullable=False, server_default="preview"),
            sa.Column("approval_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_access_policy_decisions_principal", "access_policy_decisions", ["principal_id"])
        op.create_index("idx_access_policy_decisions_decision", "access_policy_decisions", ["decision"])
        op.create_index("idx_access_policy_decisions_level", "access_policy_decisions", ["data_level"])
        op.create_index("idx_access_policy_decisions_created", "access_policy_decisions", ["created_at"])


def downgrade() -> None:
    for table, indexes in (
        ("access_policy_decisions", [
            "idx_access_policy_decisions_created",
            "idx_access_policy_decisions_level",
            "idx_access_policy_decisions_decision",
            "idx_access_policy_decisions_principal",
        ]),
        ("access_data_policies", [
            "ix_access_data_policies_execution_profile_code",
            "idx_access_data_policies_priority",
            "idx_access_data_policies_status",
        ]),
        ("access_execution_profiles", [
            "idx_access_execution_profiles_level",
            "idx_access_execution_profiles_status",
        ]),
        ("access_principal_preferences", []),
        ("access_delegation_events", [
            "idx_access_delegation_events_created",
            "idx_access_delegation_events_message",
            "idx_access_delegation_events_delegated",
            "idx_access_delegation_events_actor",
        ]),
        ("access_role_bindings", [
            "idx_access_role_bindings_status",
            "idx_access_role_bindings_role",
            "idx_access_role_bindings_subject",
        ]),
        ("access_api_keys", [
            "idx_access_api_keys_prefix",
            "idx_access_api_keys_status",
            "idx_access_api_keys_principal",
        ]),
        ("access_service_principals", [
            "idx_access_service_principals_status",
            "idx_access_service_principals_owner",
            "idx_access_service_principals_type",
        ]),
        ("access_principal_aliases", ["idx_access_principal_aliases_principal"]),
        ("access_principals", [
            "idx_access_principals_status",
            "idx_access_principals_tenant",
            "idx_access_principals_type",
        ]),
    ):
        if _has_table(table):
            for index_name in indexes:
                op.drop_index(index_name, table_name=table)
            op.drop_table(table)
