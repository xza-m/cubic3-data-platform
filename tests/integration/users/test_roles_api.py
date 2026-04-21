# tests/integration/users/test_roles_api.py
"""
W4.D-2 · 角色管理 API 集成测试

覆盖：
    GET    /api/v1/roles
    GET    /api/v1/roles/<id>
    POST   /api/v1/roles
    PUT    /api/v1/roles/<id>
    DELETE /api/v1/roles/<id>
    GET    /api/v1/permissions
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest

BASE = "/api/v1/roles"


@pytest.fixture
def role_factory(app):
    created = []

    def _make(*, code: str = "qa_role", name: str = "QA Role", permissions=None):
        from app.application.users.role_service import RoleService
        from app.extensions import db
        from app.infrastructure.users.repositories import SqlRoleRepository

        svc = RoleService(SqlRoleRepository(db.session))
        role = svc.create_role(
            {"code": code, "name": name, "permissions": permissions or []}
        )
        created.append(role["id"])
        return role

    yield _make

    from app.extensions import db
    from app.infrastructure.users.repositories import SqlRoleRepository

    repo = SqlRoleRepository(db.session)
    for rid in created:
        try:
            repo.delete(rid)
        except Exception:
            pass


def _viewer_token(app):
    payload = {
        "user_id": "viewer1",
        "user_name": "viewer",
        "roles": ["user"],
        "iat": datetime.now(tz=timezone.utc),
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(
        payload, app.config.get("JWT_SECRET", "your-secret-key"), algorithm="HS256"
    )


# ===========================================================================
# Happy Path
# ===========================================================================


@pytest.mark.redesign
class TestListRoles:
    def test_list_returns_envelope(self, client):
        resp = client.get(BASE)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert "items" in body["data"]

    def test_list_includes_created(self, client, role_factory):
        r = role_factory(code="lst_role", name="List Role")
        resp = client.get(BASE)
        codes = [it["code"] for it in resp.get_json()["data"]["items"]]
        assert "lst_role" in codes

    def test_search_q(self, client, role_factory):
        role_factory(code="findme_role", name="Findme")
        resp = client.get(f"{BASE}?q=findme")
        codes = [it["code"] for it in resp.get_json()["data"]["items"]]
        assert "findme_role" in codes


@pytest.mark.redesign
class TestGetRole:
    def test_get_existing(self, client, role_factory):
        r = role_factory(code="g_role", name="G")
        resp = client.get(f"{BASE}/{r['id']}")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["id"] == r["id"]

    def test_get_missing_returns_404(self, client):
        resp = client.get(f"{BASE}/9999999")
        assert resp.status_code == 404


@pytest.mark.redesign
class TestCreateRole:
    def test_create_with_explicit_code(self, client):
        resp = client.post(
            BASE,
            json={
                "code": "new_role",
                "name": "New Role",
                "permissions": ["datasource:read"],
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert data["code"] == "new_role"
        assert "datasource:read" in data["permissions"]

    def test_create_auto_slug_from_name(self, client):
        resp = client.post(
            BASE, json={"name": "Auto Generated"}
        )
        assert resp.status_code == 201
        # 自动 slugify：空格 → 下划线，且小写
        assert resp.get_json()["data"]["code"] == "auto_generated"

    def test_create_with_no_permissions(self, client):
        resp = client.post(
            BASE, json={"code": "noperm", "name": "No perm"}
        )
        assert resp.status_code == 201
        assert resp.get_json()["data"]["permissions"] == []


@pytest.mark.redesign
class TestUpdateRole:
    def test_update_name(self, client, role_factory):
        r = role_factory(code="upd_role", name="Old Name")
        resp = client.put(f"{BASE}/{r['id']}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.get_json()["data"]["name"] == "New Name"

    def test_update_permissions(self, client, role_factory):
        r = role_factory(code="upd_perm", name="Perm")
        resp = client.put(
            f"{BASE}/{r['id']}",
            json={"permissions": ["datasource:read", "datasource:write"]},
        )
        assert resp.status_code == 200
        assert set(resp.get_json()["data"]["permissions"]) == {
            "datasource:read",
            "datasource:write",
        }


@pytest.mark.redesign
class TestDeleteRole:
    def test_delete_unused_role(self, client, role_factory):
        r = role_factory(code="del_role", name="Del")
        resp = client.delete(f"{BASE}/{r['id']}")
        assert resp.status_code == 200
        assert client.get(f"{BASE}/{r['id']}").status_code == 404


# ===========================================================================
# Error
# ===========================================================================


@pytest.mark.redesign
class TestCreateRoleErrors:
    def test_empty_payload_returns_400(self, client):
        resp = client.post(BASE, json={})
        assert resp.status_code == 400

    def test_missing_name_returns_400(self, client):
        resp = client.post(BASE, json={"code": "x"})
        assert resp.status_code == 400

    def test_invalid_code_returns_400(self, client):
        resp = client.post(BASE, json={"code": "9bad", "name": "Bad"})
        assert resp.status_code == 400

    def test_unknown_permission_returns_400(self, client):
        resp = client.post(
            BASE,
            json={"code": "unkperm", "name": "Unkperm", "permissions": ["nope:nope"]},
        )
        assert resp.status_code == 400

    def test_duplicate_code_returns_409(self, client, role_factory):
        role_factory(code="dup_role", name="Dup")
        resp = client.post(BASE, json={"code": "dup_role", "name": "Dup2"})
        assert resp.status_code == 409


@pytest.mark.redesign
class TestDeleteRoleErrors:
    def test_delete_role_in_use_returns_400(self, client, role_factory):
        r = role_factory(code="inuse_role", name="InUse")
        # 创建一个用户并分配该角色 — 直接走 Flask db.session（与 role_factory / API 一致）
        from app.application.users.user_service import UserService
        from app.extensions import db
        from app.infrastructure.users.password import BcryptHasher
        from app.infrastructure.users.repositories import (
            SqlRoleRepository,
            SqlUserRepository,
        )

        user_svc = UserService(
            user_repo=SqlUserRepository(db.session),
            role_repo=SqlRoleRepository(db.session),
            password_hasher=BcryptHasher(),
        )
        u = user_svc.create_user(
            {
                "username": "ru1",
                "password": "secret123",
                "role_ids": [r["id"]],
            }
        )
        try:
            resp = client.delete(f"{BASE}/{r['id']}")
            assert resp.status_code == 400
            assert resp.get_json()["error_code"] == "ROLE_IN_USE"
        finally:
            SqlUserRepository(db.session).delete(u["id"])

    def test_delete_missing_returns_404(self, client):
        resp = client.delete(f"{BASE}/9999999")
        assert resp.status_code == 404


# ===========================================================================
# RBAC
# ===========================================================================


@pytest.mark.redesign
class TestRolesRBAC:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401

    def test_list_visible_for_viewer(self, client_no_auth, app):
        token = _viewer_token(app)
        resp = client_no_auth.get(BASE, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_create_requires_admin(self, client_no_auth, app):
        token = _viewer_token(app)
        resp = client_no_auth.post(
            BASE,
            json={"code": "rbac_role", "name": "RBAC"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ===========================================================================
# Permissions endpoint
# ===========================================================================


@pytest.mark.redesign
class TestPermissions:
    def test_list_permissions(self, client):
        resp = client.get("/api/v1/permissions")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        items = body["data"]["items"]
        assert isinstance(items, list)
        codes = {it["code"] for it in items}
        assert "datasource:read" in codes
