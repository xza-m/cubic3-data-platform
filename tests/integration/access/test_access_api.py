from __future__ import annotations

from app.application.access.identity import AccessIdentityService
from app.infrastructure.access.repositories import SqlAccessRepository
from tests.conftest import _make_jwt, install_default_admin_auth


def test_access_role_catalog_exposes_builtin_roles_and_api_key_scopes(app):
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))

    resp = client.get("/api/v1/access/role-catalog")

    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert [item["name"] for item in payload["platform_roles"]] == ["管理员", "产品经理", "数据开发", "普通用户"]
    assert [item["role_code"] for item in payload["platform_roles"]] == [
        "governance_admin",
        "product_manager",
        "semantic_modeler",
        "viewer",
    ]
    assert [item["name"] for item in payload["data_roles"]] == [
        "基础数据读取",
        "汇总数据读取",
        "明细数据读取",
    ]
    assert [item["role_code"] for item in payload["data_roles"]] == [
        "data_m0_reader",
        "data_m1_reader",
        "data_m2_detail_reader",
    ]
    assert "agent.semantic.plan" in payload["api_key_scopes"]
    assert "data_m3_requester" not in [item["role_code"] for item in payload["data_roles"]]


def test_access_api_does_not_trust_jwt_role_claims(app):
    token = _make_jwt(
        user_id="jwt_only_admin",
        user_name="JWT Only Admin",
        roles=["platform_admin", "governance_admin"],
    )
    client = app.test_client()
    resp = client.get(
        "/api/v1/access/principals",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


def test_viewer_cannot_read_access_management(app):
    client = install_default_admin_auth(app.test_client(), roles=("viewer",))

    resp = client.get("/api/v1/access/principals")

    assert resp.status_code == 403


def test_require_admin_uses_access_role_bindings(app):
    from app.interfaces.api.middleware.auth import require_admin
    from app.shared.response import success

    @app.get("/__test__/access-admin-probe")
    @require_admin
    def access_admin_probe():
        return success({"ok": True})

    jwt_only_admin = _make_jwt(
        user_id="jwt_only_admin",
        user_name="JWT Only Admin",
        roles=["platform_admin"],
    )
    unauthorized = app.test_client().get(
        "/__test__/access-admin-probe",
        headers={"Authorization": f"Bearer {jwt_only_admin}"},
    )
    assert unauthorized.status_code == 403

    client = install_default_admin_auth(app.test_client(), roles=("platform_admin",))
    authorized = client.get("/__test__/access-admin-probe")
    assert authorized.status_code == 200


def test_service_principal_api_key_lifecycle_hides_plaintext_after_creation(app, db_session):
    access_service = AccessIdentityService(SqlAccessRepository(db_session))
    owner = access_service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_owner",
        union_id="on_owner",
        display_name="负责人",
    )

    client = install_default_admin_auth(app.test_client(), roles=("platform_admin",))

    created_service = client.post(
        "/api/v1/access/service-principals",
        json={
            "tenant_key": "tenant_a",
            "service_type": "bot",
            "code": "feishu_dw_query",
            "owner_principal_id": owner.principal_id,
            "owner_team": "数据平台",
            "description": "飞书问数 Bot",
            "allowed_tenants": ["tenant_a"],
            "delegation_rules": {"allow_feishu_user": True},
        },
    )
    assert created_service.status_code == 201
    principal_id = created_service.get_json()["data"]["principal_id"]

    created_key = client.post(
        f"/api/v1/access/service-principals/{principal_id}/api-keys",
        json={
            "scopes": ["agent.semantic.plan", "delegation.feishu_user"],
            "rate_limit_per_minute": 60,
        },
    )
    assert created_key.status_code == 201
    key_payload = created_key.get_json()["data"]
    assert key_payload["api_key"].startswith(f"c3_live_{key_payload['key_id']}_")

    detail = client.get(f"/api/v1/access/service-principals/{principal_id}")
    assert detail.status_code == 200
    keys = detail.get_json()["data"]["api_keys"]
    assert keys[0]["key_id"] == key_payload["key_id"]
    assert "api_key" not in keys[0]
    assert keys[0]["key_prefix"].startswith("c3_live_")

    revoked = client.post(f"/api/v1/access/api-keys/{key_payload['key_id']}/revoke")
    assert revoked.status_code == 200
    assert revoked.get_json()["data"]["status"] == "revoked"


def test_principal_role_binding_api_separates_platform_and_data_roles(app, db_session):
    access_service = AccessIdentityService(SqlAccessRepository(db_session))
    principal = access_service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_user",
        union_id="on_user",
        display_name="李四",
    )
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))

    assigned = client.put(
        f"/api/v1/access/principals/{principal.principal_id}/role-bindings",
        json={
            "bindings": [
                {"role_code": "semantic_modeler", "role_type": "platform"},
                {"role_code": "data_m1_reader", "role_type": "data"},
            ]
        },
    )
    assert assigned.status_code == 200

    detail = client.get(f"/api/v1/access/principals/{principal.principal_id}")
    assert detail.status_code == 200
    payload = detail.get_json()["data"]
    assert payload["principal_id"] == principal.principal_id
    assert payload["platform_roles"] == ["semantic_modeler"]
    assert payload["data_roles"] == ["data_m1_reader"]


def test_permission_package_api_assigns_simplified_admin_product_model(app, db_session):
    access_service = AccessIdentityService(SqlAccessRepository(db_session))
    principal = access_service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_package_user",
        union_id="on_package_user",
        display_name="运营同学",
    )
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))

    catalog = client.get("/api/v1/access/permission-packages")
    assert catalog.status_code == 200
    packages = catalog.get_json()["data"]["items"]
    platform_packages = [item for item in packages if item["role_type"] == "platform"]
    data_packages = [item for item in packages if item["role_type"] == "data"]
    assert [item["name"] for item in platform_packages] == ["管理员", "产品经理", "数据开发", "普通用户"]
    assert [item["name"] for item in data_packages] == ["基础数据读取", "汇总数据读取", "明细数据读取"]

    assigned = client.put(
        f"/api/v1/access/principals/{principal.principal_id}/permission-packages",
        json={"package_codes": ["data_developer", "data_m2_detail_reader"]},
    )
    assert assigned.status_code == 200
    assigned_payload = assigned.get_json()["data"]
    assert assigned_payload["package_codes"] == ["data_developer", "data_m2_detail_reader"]
    assert assigned_payload["role_codes"] == [
        "semantic_modeler",
        "data_m0_reader",
        "data_m1_reader",
        "data_m2_detail_reader",
    ]

    detail = client.get(f"/api/v1/access/principals/{principal.principal_id}")
    assert detail.status_code == 200
    payload = detail.get_json()["data"]
    assert payload["platform_roles"] == ["semantic_modeler"]
    assert payload["data_roles"] == ["data_m0_reader", "data_m1_reader", "data_m2_detail_reader"]


def test_m2_allowlist_api_explains_config_matches_and_current_grants(app, db_session):
    app.config["FEISHU_M2_READER_OPEN_IDS"] = "ou_m2_user,ou_not_seen"
    app.config["FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST"] = False

    access_service = AccessIdentityService(SqlAccessRepository(db_session))
    principal = access_service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_m2_user",
        union_id="on_m2_user",
        display_name="默认 M2 用户",
    )
    access_service.ensure_principal_role_bindings(
        principal_id=principal.principal_id,
        roles=["data_m0_reader", "data_m1_reader", "data_m2_detail_reader"],
        source="feishu_m2_allowlist",
        created_by="system",
    )
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))

    resp = client.get("/api/v1/access/m2-allowlist")

    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["summary"] == {
        "configured_count": 2,
        "matched_count": 1,
        "unmatched_count": 1,
        "current_m2_count": 1,
        "sync_cubic3_allowlist": False,
    }
    by_identifier = {item["identifier"]: item for item in payload["items"]}
    assert by_identifier["ou_m2_user"]["match_status"] == "matched"
    assert by_identifier["ou_m2_user"]["principal_id"] == principal.principal_id
    assert by_identifier["ou_m2_user"]["grant_status"] == "granted"
    assert by_identifier["ou_not_seen"]["match_status"] == "unmatched"
    assert by_identifier["ou_not_seen"]["grant_status"] == "pending_login"

    current = payload["current_principals"]
    assert len(current) == 1
    assert current[0]["principal_id"] == principal.principal_id
    assert current[0]["source"] == "feishu_m2_allowlist"
    assert current[0]["in_configured_allowlist"] is True
