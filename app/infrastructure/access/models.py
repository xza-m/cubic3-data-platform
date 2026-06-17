"""统一 Principal 身份治理 ORM 模型。"""
from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow

_BIG_PK = BigInteger().with_variant(Integer(), "sqlite")


class AccessPrincipalORM(db.Model):
    __tablename__ = "access_principals"
    __table_args__ = (
        Index("idx_access_principals_type", "principal_type"),
        Index("idx_access_principals_tenant", "tenant_key"),
        Index("idx_access_principals_status", "status"),
        {"extend_existing": True},
    )

    principal_id = Column(String(191), primary_key=True)
    principal_type = Column(String(32), nullable=False)
    idp = Column(String(32), nullable=False)
    tenant_key = Column(String(128), nullable=False)
    display_name = Column(String(128), nullable=True)
    email = Column(String(255), nullable=True)
    employee_no = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    raw_profile = Column(JsonType, nullable=False, default=dict)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AccessPrincipalAliasORM(db.Model):
    __tablename__ = "access_principal_aliases"
    __table_args__ = (
        UniqueConstraint(
            "idp",
            "tenant_key",
            "external_id_type",
            "external_id",
            name="uq_access_principal_alias_external",
        ),
        Index("idx_access_principal_aliases_principal", "principal_id"),
        {"extend_existing": True},
    )

    id = Column(_BIG_PK, primary_key=True, autoincrement=True)
    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        nullable=False,
    )
    idp = Column(String(32), nullable=False)
    tenant_key = Column(String(128), nullable=False)
    external_id_type = Column(String(32), nullable=False)
    external_id = Column(String(191), nullable=False)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    created_at = Column(DateTime, nullable=False, default=utcnow)


class AccessServicePrincipalORM(db.Model):
    __tablename__ = "access_service_principals"
    __table_args__ = (
        Index("idx_access_service_principals_type", "service_type"),
        Index("idx_access_service_principals_owner", "owner_principal_id"),
        Index("idx_access_service_principals_status", "status"),
        {"extend_existing": True},
    )

    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        primary_key=True,
    )
    service_type = Column(String(32), nullable=False)
    owner_principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="RESTRICT"),
        nullable=False,
    )
    owner_team = Column(String(128), nullable=True)
    description = Column(Text, nullable=True)
    allowed_tenants = Column(JsonType, nullable=False, default=list)
    delegation_rules = Column(JsonType, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    disabled_at = Column(DateTime, nullable=True)
    disabled_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AccessApiKeyORM(db.Model):
    __tablename__ = "access_api_keys"
    __table_args__ = (
        Index("idx_access_api_keys_principal", "principal_id"),
        Index("idx_access_api_keys_status", "status"),
        Index("idx_access_api_keys_prefix", "key_prefix"),
        {"extend_existing": True},
    )

    key_id = Column(String(64), primary_key=True)
    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        nullable=False,
    )
    key_prefix = Column(String(128), nullable=False)
    key_hash = Column(String(128), nullable=False)
    scopes = Column(JsonType, nullable=False, default=list)
    allowed_ips = Column(JsonType, nullable=False, default=list)
    rate_limit_per_minute = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    last_rotated_at = Column(DateTime, nullable=True)
    usage_count = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(String(32), nullable=False, default="active", server_default="active")
    # 语义 release pin：{"pin_policy": "pinned"|"track_active", "release_id": "..."}（§6.1）
    semantic_pin = Column(JsonType, nullable=True)
    created_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class AuthRefreshSessionORM(db.Model):
    """平台 Refresh Token 会话。

    Refresh Token 使用不透明随机串，数据库只保存哈希；每次刷新都会轮换会话，
    旧会话立即作废，用于撤销与重复使用检测。
    """

    __tablename__ = "auth_refresh_sessions"
    __table_args__ = (
        Index("idx_auth_refresh_sessions_principal", "principal_id"),
        Index("idx_auth_refresh_sessions_family", "token_family_id"),
        Index("idx_auth_refresh_sessions_hash", "refresh_token_hash"),
        Index("idx_auth_refresh_sessions_status", "revoked_at", "expires_at"),
        {"extend_existing": True},
    )

    session_id = Column(String(64), primary_key=True)
    token_family_id = Column(String(64), nullable=False)
    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_name = Column(String(128), nullable=True)
    roles = Column(JsonType, nullable=False, default=list)
    refresh_token_hash = Column(String(128), nullable=False, unique=True)
    auth_method = Column(String(32), nullable=False)
    client_type = Column(String(32), nullable=False, default="web", server_default="web")
    user_agent = Column(String(255), nullable=True)
    ip_address = Column(String(64), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoke_reason = Column(String(64), nullable=True)
    replaced_by_session_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AuthAuthorizationCodeORM(db.Model):
    """飞书 SSO 一次性授权码。

    授权码只在浏览器重定向 URL 中出现，真实 Token Pair 只能通过后端交换接口获取。
    """

    __tablename__ = "auth_authorization_codes"
    __table_args__ = (
        Index("idx_auth_authorization_codes_hash", "code_hash"),
        Index("idx_auth_authorization_codes_principal", "principal_id"),
        Index("idx_auth_authorization_codes_expires", "expires_at"),
        {"extend_existing": True},
    )

    code_id = Column(String(64), primary_key=True)
    code_hash = Column(String(128), nullable=False, unique=True)
    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_name = Column(String(128), nullable=True)
    roles = Column(JsonType, nullable=False, default=list)
    client_type = Column(String(32), nullable=False, default="web", server_default="web")
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class AccessRoleBindingORM(db.Model):
    __tablename__ = "access_role_bindings"
    __table_args__ = (
        UniqueConstraint(
            "subject_type",
            "subject_key",
            "role_code",
            "role_type",
            "effective_from",
            name="uq_access_role_bindings_effective",
        ),
        Index("idx_access_role_bindings_subject", "subject_type", "subject_key"),
        Index("idx_access_role_bindings_role", "role_type", "role_code"),
        Index("idx_access_role_bindings_status", "status"),
        {"extend_existing": True},
    )

    id = Column(_BIG_PK, primary_key=True, autoincrement=True)
    subject_type = Column(String(32), nullable=False)
    subject_key = Column(String(255), nullable=False)
    role_code = Column(String(64), nullable=False)
    role_type = Column(String(32), nullable=False)
    source = Column(String(32), nullable=False, default="manual", server_default="manual")
    effective_from = Column(DateTime, nullable=True)
    effective_to = Column(DateTime, nullable=True)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    created_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class AccessDelegationEventORM(db.Model):
    __tablename__ = "access_delegation_events"
    __table_args__ = (
        Index("idx_access_delegation_events_actor", "actor_principal_id"),
        Index("idx_access_delegation_events_delegated", "delegated_principal_id"),
        Index("idx_access_delegation_events_message", "message_id"),
        Index("idx_access_delegation_events_created", "created_at"),
        {"extend_existing": True},
    )

    id = Column(_BIG_PK, primary_key=True, autoincrement=True)
    actor_principal_id = Column(String(191), nullable=False)
    delegated_principal_id = Column(String(191), nullable=True)
    tenant_key = Column(String(128), nullable=True)
    message_id = Column(String(191), nullable=True)
    chat_id = Column(String(191), nullable=True)
    event_id = Column(String(191), nullable=True)
    endpoint = Column(String(255), nullable=True)
    decision = Column(String(32), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class AccessPrincipalScopeORM(db.Model):
    """Principal 数据范围属性（RLS row_scope 求值取值来源）。"""

    __tablename__ = "access_principal_scopes"
    __table_args__ = (
        UniqueConstraint(
            "principal_id",
            "attribute",
            "source",
            name="uq_access_principal_scopes_attr_source",
        ),
        Index("idx_access_principal_scopes_principal", "principal_id"),
        Index("idx_access_principal_scopes_attribute", "attribute"),
        {"extend_existing": True},
    )

    id = Column(_BIG_PK, primary_key=True, autoincrement=True)
    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        nullable=False,
    )
    attribute = Column(String(128), nullable=False)
    values = Column(JsonType, nullable=False, default=list)
    source = Column(String(32), nullable=False, default="manual", server_default="manual")
    synced_at = Column(DateTime, nullable=True)
    created_by = Column(String(191), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class PrincipalPreferencesORM(db.Model):
    """Principal 个性化偏好。"""

    __tablename__ = "access_principal_preferences"
    __table_args__ = ({"extend_existing": True},)

    principal_id = Column(
        String(191),
        ForeignKey("access_principals.principal_id", ondelete="CASCADE"),
        primary_key=True,
    )
    theme = Column(String(16), nullable=False, default="system", server_default="system")
    default_landing = Column(
        String(128),
        nullable=False,
        default="/dashboard",
        server_default="/dashboard",
    )
    list_page_size = Column(Integer, nullable=False, default=20, server_default="20")
    table_density = Column(
        String(16),
        nullable=False,
        default="comfortable",
        server_default="comfortable",
    )
    extra = Column(JsonType, nullable=False, default=dict)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
