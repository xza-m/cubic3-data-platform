# tests/integration/users/test_users_api.py
"""
W4.D-2 · 用户管理 API 集成测试

覆盖：
    GET    /api/v1/users
    GET    /api/v1/users/<id>
    POST   /api/v1/users
    PUT    /api/v1/users/<id>
    PUT    /api/v1/users/<id>/roles
    DELETE /api/v1/users/<id>

矩阵：happy / boundary / error + RBAC（admin vs viewer vs anon）。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest

BASE = "/api/v1/users"


# ---------------------------------------------------------------------------
# fixtures：临时角色 / 用户工厂（绕过 API 直接通过 service 准备数据）
# ---------------------------------------------------------------------------


@pytest.fixture
def role_factory(app):
    """创建临时角色，返回 dict（包含 id / code）。"""
    created = []

    def _make(*, code: str = "tester", name: str = "Tester", permissions=None):
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

    role_repo = SqlRoleRepository(db.session)
    for rid in created:
        try:
            role_repo.delete(rid)
        except Exception:
            pass


@pytest.fixture
def user_factory(app):
    """创建临时普通用户，返回 dict。

    使用 Flask-SQLAlchemy ``db.session``（而非 Container 的独立 session），
    确保与测试 fixture 的 ``db.create_all()`` 共享同一个 SQLite in-memory 连接，
    否则 Container 会拿到自己的 engine + 自己的 ``:memory:`` 库 → no such table。
    """
    created = []

    def _make(**overrides):
        from app.application.users.user_service import UserService
        from app.extensions import db
        from app.infrastructure.users.password import BcryptHasher
        from app.infrastructure.users.repositories import (
            SqlRoleRepository,
            SqlUserRepository,
        )

        svc = UserService(
            user_repo=SqlUserRepository(db.session),
            role_repo=SqlRoleRepository(db.session),
            password_hasher=BcryptHasher(),
        )
        payload = {
            "username": overrides.pop("username", "alice"),
            "display_name": overrides.pop("display_name", "Alice"),
            "email": overrides.pop("email", "alice@example.com"),
            "password": overrides.pop("password", "secret123"),
            **overrides,
        }
        user = svc.create_user(payload)
        created.append(user["id"])
        return user

    yield _make

    from app.extensions import db
    from app.infrastructure.users.repositories import SqlUserRepository

    repo = SqlUserRepository(db.session)
    for uid in created:
        try:
            repo.delete(uid)
        except Exception:
            pass


def _viewer_token(app):
    """无 admin 角色的合法 JWT（仅 user 角色）。"""
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
class TestListUsers:
    def test_empty_list_returns_200_with_envelope(self, client):
        resp = client.get(BASE)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert "items" in body["data"]
        assert "total" in body["data"]

    def test_list_after_create_includes_user(self, client, user_factory):
        u = user_factory(username="bob")
        resp = client.get(BASE)
        usernames = [it["username"] for it in resp.get_json()["data"]["items"]]
        assert "bob" in usernames
        # 字段契约：list 项必须含 is_active / role_ids
        match = next(it for it in resp.get_json()["data"]["items"] if it["id"] == u["id"])
        assert "is_active" in match
        assert "role_ids" in match

    def test_pagination_size_capped(self, client):
        # size 超上界仅会被夹紧到 200，不应 422
        resp = client.get(f"{BASE}?page=1&size=999")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["size"] == 200

    def test_search_q_filter(self, client, user_factory):
        user_factory(username="search_target", display_name="Search Target")
        user_factory(username="other_user")
        resp = client.get(f"{BASE}?q=search")
        assert resp.status_code == 200
        items = resp.get_json()["data"]["items"]
        assert any(i["username"] == "search_target" for i in items)
        assert all("search" in (i["username"] + (i.get("display_name") or "")).lower() for i in items)

    def test_filter_by_status_active(self, client, user_factory):
        user_factory(username="u_active", is_active=True)
        u_disabled = user_factory(username="u_disabled", is_active=False)
        resp = client.get(f"{BASE}?status=active")
        usernames = [i["username"] for i in resp.get_json()["data"]["items"]]
        assert "u_active" in usernames
        assert "u_disabled" not in usernames

    def test_filter_by_is_active_query_param(self, client, user_factory):
        user_factory(username="u_active2", is_active=True)
        user_factory(username="u_disabled2", is_active=False)
        resp = client.get(f"{BASE}?is_active=false")
        usernames = [i["username"] for i in resp.get_json()["data"]["items"]]
        assert "u_disabled2" in usernames
        assert "u_active2" not in usernames


@pytest.mark.redesign
class TestGetUser:
    def test_get_existing_returns_user(self, client, user_factory):
        u = user_factory(username="charlie")
        resp = client.get(f"{BASE}/{u['id']}")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["id"] == u["id"]
        assert data["username"] == "charlie"
        assert "is_active" in data
        assert "role_ids" in data

    def test_get_missing_returns_404(self, client):
        resp = client.get(f"{BASE}/9999999")
        assert resp.status_code == 404


@pytest.mark.redesign
class TestCreateUser:
    def test_create_minimal_payload(self, client):
        resp = client.post(
            BASE, json={"username": "dave", "password": "secret123"}
        )
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert data["username"] == "dave"
        assert data["is_active"] is True

    def test_create_with_roles(self, client, role_factory):
        r = role_factory(code="qa", name="QA")
        resp = client.post(
            BASE,
            json={
                "username": "ed",
                "password": "secret123",
                "role_ids": [r["id"]],
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()["data"]
        assert r["id"] in data["role_ids"]

    def test_create_disabled_user(self, client):
        resp = client.post(
            BASE,
            json={
                "username": "fred",
                "password": "secret123",
                "is_active": False,
            },
        )
        assert resp.status_code == 201
        assert resp.get_json()["data"]["is_active"] is False


@pytest.mark.redesign
class TestUpdateUser:
    def test_update_display_name(self, client, user_factory):
        u = user_factory(username="grace")
        resp = client.put(
            f"{BASE}/{u['id']}", json={"display_name": "Grace Hopper"}
        )
        assert resp.status_code == 200
        assert resp.get_json()["data"]["display_name"] == "Grace Hopper"

    def test_update_is_active_false_disables(self, client, user_factory):
        u = user_factory(username="harry", is_active=True)
        resp = client.put(f"{BASE}/{u['id']}", json={"is_active": False})
        assert resp.status_code == 200
        assert resp.get_json()["data"]["is_active"] is False

    def test_update_password_no_error(self, client, user_factory):
        u = user_factory(username="ivy")
        resp = client.put(f"{BASE}/{u['id']}", json={"password": "newsecret"})
        assert resp.status_code == 200


@pytest.mark.redesign
class TestAssignRoles:
    def test_assign_roles_by_role_ids(self, client, user_factory, role_factory):
        u = user_factory(username="jake")
        r1 = role_factory(code="role_a", name="Role A")
        r2 = role_factory(code="role_b", name="Role B")
        resp = client.put(
            f"{BASE}/{u['id']}/roles", json={"role_ids": [r1["id"], r2["id"]]}
        )
        assert resp.status_code == 200
        assert set(resp.get_json()["data"]["role_ids"]) == {r1["id"], r2["id"]}

    def test_assign_roles_by_role_codes(self, client, user_factory, role_factory):
        u = user_factory(username="kate")
        r1 = role_factory(code="rc_a", name="RC A")
        resp = client.put(
            f"{BASE}/{u['id']}/roles", json={"role_codes": ["rc_a"]}
        )
        assert resp.status_code == 200
        assert "rc_a" in resp.get_json()["data"]["role_codes"]

    def test_assign_empty_clears_roles(self, client, user_factory, role_factory):
        u = user_factory(username="leo")
        r = role_factory(code="rc_temp", name="Temp")
        client.put(f"{BASE}/{u['id']}/roles", json={"role_ids": [r["id"]]})
        resp = client.put(f"{BASE}/{u['id']}/roles", json={"role_ids": []})
        assert resp.status_code == 200
        assert resp.get_json()["data"]["role_ids"] == []


@pytest.mark.redesign
class TestDeleteUser:
    def test_delete_normal_user(self, client, user_factory):
        u = user_factory(username="mona")
        resp = client.delete(f"{BASE}/{u['id']}")
        assert resp.status_code == 200
        # 删除后 GET 应 404
        assert client.get(f"{BASE}/{u['id']}").status_code == 404


# ===========================================================================
# Error / Boundary
# ===========================================================================


@pytest.mark.redesign
class TestCreateUserErrors:
    def test_create_empty_body_returns_400(self, client):
        resp = client.post(BASE, json={})
        assert resp.status_code == 400

    def test_create_missing_username_returns_400(self, client):
        resp = client.post(BASE, json={"password": "secret123"})
        assert resp.status_code == 400

    def test_create_invalid_username_returns_400(self, client):
        resp = client.post(BASE, json={"username": "1bad", "password": "secret123"})
        assert resp.status_code == 400

    def test_create_short_password_returns_400(self, client):
        resp = client.post(BASE, json={"username": "alex", "password": "x"})
        assert resp.status_code == 400

    def test_create_duplicate_username_returns_409(self, client, user_factory):
        user_factory(username="dup_user")
        resp = client.post(
            BASE, json={"username": "dup_user", "password": "secret123"}
        )
        assert resp.status_code == 409
        body = resp.get_json()
        assert body["error_code"] == "DUPLICATE_USERNAME"

    def test_create_with_unknown_role_id_returns_404(self, client):
        resp = client.post(
            BASE,
            json={
                "username": "noroleuser",
                "password": "secret123",
                "role_ids": [99999],
            },
        )
        assert resp.status_code == 404


@pytest.mark.redesign
class TestUpdateUserErrors:
    def test_update_missing_user_returns_404(self, client):
        resp = client.put(
            f"{BASE}/999999", json={"display_name": "ghost"}
        )
        assert resp.status_code == 404

    def test_update_invalid_status_returns_400(self, client, user_factory):
        u = user_factory(username="badstatus")
        resp = client.put(f"{BASE}/{u['id']}", json={"status": "garbage"})
        assert resp.status_code == 400


@pytest.mark.redesign
class TestAssignRolesErrors:
    def test_assign_unknown_role_id_returns_404(self, client, user_factory):
        u = user_factory(username="urole")
        resp = client.put(f"{BASE}/{u['id']}/roles", json={"role_ids": [999999]})
        assert resp.status_code == 404

    def test_assign_unknown_role_code_returns_404(self, client, user_factory):
        u = user_factory(username="urcode")
        resp = client.put(
            f"{BASE}/{u['id']}/roles", json={"role_codes": ["does_not_exist"]}
        )
        assert resp.status_code == 404

    def test_missing_payload_returns_400(self, client, user_factory):
        u = user_factory(username="upayload")
        resp = client.put(f"{BASE}/{u['id']}/roles", json={})
        assert resp.status_code == 400


# ===========================================================================
# RBAC
# ===========================================================================


@pytest.mark.redesign
class TestRBAC:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401

    def test_create_requires_admin(self, client_no_auth, app):
        token = _viewer_token(app)
        resp = client_no_auth.post(
            BASE,
            json={"username": "noadmin", "password": "secret123"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_list_visible_for_viewer(self, client_no_auth, app):
        token = _viewer_token(app)
        resp = client_no_auth.get(
            BASE, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200

    def test_delete_requires_admin(self, client_no_auth, app, user_factory):
        u = user_factory(username="rbacdel")
        token = _viewer_token(app)
        resp = client_no_auth.delete(
            f"{BASE}/{u['id']}", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403
