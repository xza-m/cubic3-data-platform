from __future__ import annotations

import time

import pytest

from app.application.access.identity import (
    AccessIdentityService,
    ApiKeyRateLimiter,
    DelegationReplayStore,
    RoleBindingResolver,
    make_human_principal_id,
    make_service_principal_id,
)
from app.infrastructure.access.repositories import SqlAccessRepository
from app.shared.exceptions import AuthorizationError, RateLimitExceededError


def _service(db_session) -> AccessIdentityService:
    return AccessIdentityService(SqlAccessRepository(db_session))


def test_feishu_principal_prefers_union_id_but_keeps_open_id_migration_identity(db_session):
    service = _service(db_session)

    fallback = service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_001",
        union_id=None,
        display_name="张三",
        email="zhangsan@example.com",
        employee_no="E001",
    )
    migrated = service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_001",
        union_id="on_001",
        display_name="张三",
        email="zhangsan@example.com",
        employee_no="E001",
    )

    assert make_human_principal_id("tenant_a", union_id="on_new", open_id="ou_new") == "feishu:tenant_a:on_new"
    assert make_human_principal_id("tenant_a", union_id=None, open_id="ou_new") == "feishu:tenant_a:ou_new"
    assert fallback.principal_id == "feishu:tenant_a:ou_001"
    assert migrated.principal_id == fallback.principal_id
    assert service.find_principal_id_by_alias(
        idp="feishu",
        tenant_key="tenant_a",
        external_id_type="union_id",
        external_id="on_001",
    ) == fallback.principal_id


def test_api_key_authenticates_service_principal_without_storing_plaintext(db_session):
    service = _service(db_session)
    owner = service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_owner",
        union_id="on_owner",
        display_name="负责人",
    )
    service_principal = service.create_service_principal(
        tenant_key="tenant_a",
        service_type="bot",
        code="feishu_dw_query",
        owner_principal_id=owner.principal_id,
        owner_team="数据平台",
        description="飞书问数 Bot",
        allowed_tenants=["tenant_a"],
        delegation_rules={"allow_feishu_user": True},
        created_by=owner.principal_id,
    )

    created_key = service.create_api_key(
        principal_id=service_principal.principal_id,
        scopes=["agent.semantic.plan", "delegation.feishu_user"],
        created_by=owner.principal_id,
    )
    authenticated = service.authenticate_api_key(created_key.api_key)

    stored_key = service.get_api_key(created_key.key_id)
    assert make_service_principal_id("tenant_a", service_type="bot", code="feishu_dw_query") == service_principal.principal_id
    assert created_key.api_key.startswith(f"c3_live_{created_key.key_id}_")
    assert stored_key is not None
    assert stored_key.key_hash
    assert created_key.api_key not in stored_key.key_hash
    assert authenticated.actor_principal_id == service_principal.principal_id
    assert authenticated.scopes == ["agent.semantic.plan", "delegation.feishu_user"]


def test_api_key_enforces_ip_allowlist_and_rate_limit(db_session):
    service = AccessIdentityService(SqlAccessRepository(db_session), rate_limiter=ApiKeyRateLimiter())
    owner = service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_owner",
        union_id="on_owner",
        display_name="负责人",
    )
    service_principal = service.create_service_principal(
        tenant_key="tenant_a",
        service_type="skill",
        code="dw_query",
        owner_principal_id=owner.principal_id,
        allowed_tenants=["tenant_a"],
        created_by=owner.principal_id,
    )
    created_key = service.create_api_key(
        principal_id=service_principal.principal_id,
        scopes=["agent.semantic.plan"],
        allowed_ips=["10.0.0.1"],
        rate_limit_per_minute=1,
        created_by=owner.principal_id,
    )

    with pytest.raises(AuthorizationError):
        service.authenticate_api_key(created_key.api_key)
    with pytest.raises(AuthorizationError):
        service.authenticate_api_key(created_key.api_key, remote_ip="10.0.0.2")

    assert service.authenticate_api_key(created_key.api_key, remote_ip="10.0.0.1").key_id == created_key.key_id
    with pytest.raises(RateLimitExceededError):
        service.authenticate_api_key(created_key.api_key, remote_ip="10.0.0.1")


def test_delegation_verifier_rejects_replay_and_ignores_body_roles(db_session):
    service = _service(db_session)
    owner = service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_owner",
        union_id="on_owner",
        display_name="负责人",
    )
    service_principal = service.create_service_principal(
        tenant_key="tenant_a",
        service_type="bot",
        code="feishu_dw_query",
        owner_principal_id=owner.principal_id,
        allowed_tenants=["tenant_a"],
        delegation_rules={"allow_feishu_user": True},
        created_by=owner.principal_id,
    )
    api_key = service.create_api_key(
        principal_id=service_principal.principal_id,
        scopes=["agent.semantic.plan", "delegation.feishu_user"],
        created_by=owner.principal_id,
    )
    actor = service.authenticate_api_key(api_key.api_key)
    replay_store = DelegationReplayStore()

    feishu_context = {
        "tenant_key": "tenant_a",
        "open_id": "ou_user",
        "union_id": "on_user",
        "message_id": "om_001",
        "chat_id": "oc_001",
        "event_id": "evt_001",
        "timestamp": int(time.time()),
        "nonce": "nonce_001",
        "roles": ["platform_admin", "data_m3_requester"],
        "data_scope": {"all": True},
    }

    principal = service.resolve_delegated_feishu_principal(
        actor=actor,
        feishu_context=feishu_context,
        replay_store=replay_store,
    )

    assert principal.principal_id == "feishu:tenant_a:on_user"
    assert principal.roles == []
    assert principal.source == "feishu_delegation"
    with pytest.raises(AuthorizationError):
        service.resolve_delegated_feishu_principal(
            actor=actor,
            feishu_context=feishu_context,
            replay_store=replay_store,
        )


def test_role_binding_resolver_splits_platform_and_data_roles(db_session):
    service = _service(db_session)
    principal = service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_user",
        union_id="on_user",
        display_name="李四",
    )
    service.put_role_bindings(
        principal_id=principal.principal_id,
        bindings=[
            {"role_code": "semantic_modeler", "role_type": "platform", "source": "manual"},
            {"role_code": "data_m1_reader", "role_type": "data", "source": "manual"},
            {"role_code": "platform_admin", "role_type": "platform", "status": "disabled"},
        ],
        created_by="test",
    )

    context = RoleBindingResolver(SqlAccessRepository(db_session)).resolve_principal_context(
        principal_id=principal.principal_id,
        actor_id="svc:tenant_a:bot:feishu_dw_query",
        actor_type="bot",
        source="feishu_delegation",
    )

    assert context.platform_roles == ["semantic_modeler"]
    assert context.data_roles == ["data_m1_reader"]
    assert context.roles == ["semantic_modeler", "data_m1_reader"]
