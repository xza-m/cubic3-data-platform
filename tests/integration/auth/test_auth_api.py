# tests/integration/auth/test_auth_api.py
"""
W5.B · Auth API 集成测试

走真实 Flask app（``client`` / ``client_no_auth`` fixture）。

覆盖路径：
  POST /api/v1/auth/login                → 登录（参数 / 引导账户回退，返回 Token Pair）
  POST /api/v1/auth/refresh              → 刷新并轮换 Token Pair
  POST /api/v1/auth/logout               → 撤销 Refresh Token
  GET  /api/v1/auth/me                   → 当前用户（含 401）
  GET  /api/v1/auth/feishu/authorize     → 飞书 SSO 跳转

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import jwt
import pytest


# ===========================================================================
# /auth/login —— 参数 + 引导账户回退（数据库为空时使用 ADMIN_USERNAME / PASSWORD）
# ===========================================================================


@pytest.mark.redesign
class TestLogin:
    def test_login_missing_credentials_returns_400(self, client_no_auth):
        resp = client_no_auth.post("/api/v1/auth/login", json={})
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0

    def test_login_bootstrap_admin_happy(self, client_no_auth, app):
        """数据库为空 + 配置有 ADMIN_USERNAME/PASSWORD 时，可登录拿到 Token Pair。"""
        app.config["ADMIN_USERNAME"] = "boot_admin"
        app.config["ADMIN_PASSWORD"] = "boot_pass"
        resp = client_no_auth.post(
            "/api/v1/auth/login",
            json={"username": "boot_admin", "password": "boot_pass"},
        )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert "token" not in body["data"]
        assert isinstance(body["data"]["access_token"], str)
        assert isinstance(body["data"]["refresh_token"], str)
        assert len(body["data"]["access_token"]) > 20
        assert len(body["data"]["refresh_token"]) > 20

    def test_login_bootstrap_wrong_password_returns_401(self, client_no_auth, app):
        app.config["ADMIN_USERNAME"] = "boot_admin"
        app.config["ADMIN_PASSWORD"] = "boot_pass"
        with patch(
            "app.interfaces.api.v1.auth._ensure_internal_principal",
            return_value="internal:local:boot_admin",
        ):
            resp = client_no_auth.post(
                "/api/v1/auth/login",
                json={"username": "boot_admin", "password": "wrong"},
            )

        assert resp.status_code == 401
        assert resp.get_json()["code"] != 0

    def test_refresh_rotates_token_pair_and_logout_revokes_refresh_token(self, client_no_auth, app):
        app.config["ADMIN_USERNAME"] = "boot_admin"
        app.config["ADMIN_PASSWORD"] = "boot_pass"
        login_resp = client_no_auth.post(
            "/api/v1/auth/login",
            json={"username": "boot_admin", "password": "boot_pass"},
        )
        assert login_resp.status_code == 200
        first_pair = login_resp.get_json()["data"]

        refresh_resp = client_no_auth.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first_pair["refresh_token"]},
        )
        assert refresh_resp.status_code == 200
        second_pair = refresh_resp.get_json()["data"]
        assert second_pair["access_token"] != first_pair["access_token"]
        assert second_pair["refresh_token"] != first_pair["refresh_token"]

        reused_resp = client_no_auth.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first_pair["refresh_token"]},
        )
        assert reused_resp.status_code == 401

        logout_resp = client_no_auth.post(
            "/api/v1/auth/logout",
            json={"refresh_token": second_pair["refresh_token"]},
        )
        assert logout_resp.status_code == 200
        assert logout_resp.get_json()["data"]["revoked"] is True

    def test_refresh_reloads_roles_from_access_bindings(self, client_no_auth, app, monkeypatch):
        app.config["ADMIN_USERNAME"] = "boot_admin"
        app.config["ADMIN_PASSWORD"] = "boot_pass"
        login_resp = client_no_auth.post(
            "/api/v1/auth/login",
            json={"username": "boot_admin", "password": "boot_pass"},
        )
        assert login_resp.status_code == 200
        first_pair = login_resp.get_json()["data"]

        monkeypatch.setattr(
            "app.interfaces.api.v1.auth._resolve_roles_for_token_refresh",
            lambda principal_id, fallback_roles: ["viewer"],
        )
        refresh_resp = client_no_auth.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first_pair["refresh_token"]},
        )

        assert refresh_resp.status_code == 200
        second_pair = refresh_resp.get_json()["data"]
        payload = jwt.decode(second_pair["access_token"], app.config["JWT_SECRET"], algorithms=["HS256"])
        assert payload["roles"] == ["viewer"]


# ===========================================================================
# /auth/me
# ===========================================================================


@pytest.mark.redesign
class TestAuthMe:
    def test_me_with_valid_token_returns_user(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        data = body["data"]
        assert data["user_id"] == "test_admin"
        assert "admin" in data["roles"]
        assert "admin" in data["platform_roles"]
        assert "access.write" in data["permissions"]
        assert data["access_roles"] == data["platform_roles"]

    def test_me_without_token_returns_401(self, client_no_auth):
        resp = client_no_auth.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_me_rejects_legacy_jwt_without_token_use(self, client_no_auth, app):
        token = jwt.encode(
            {
                "user_id": "legacy-user",
                "user_name": "Legacy User",
                "roles": ["admin"],
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            app.config["JWT_SECRET"],
            algorithm="HS256",
        )
        resp = client_no_auth.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401


# ===========================================================================
# /auth/feishu/authorize
# ===========================================================================


@pytest.mark.redesign
class TestFeishuAuthorize:
    def test_authorize_redirects_when_app_id_set(self, client_no_auth, app):
        app.config["FEISHU_APP_ID"] = "cli_test"
        app.config["APP_BASE_URL"] = "http://example.com"
        resp = client_no_auth.get("/api/v1/auth/feishu/authorize")
        assert resp.status_code in (301, 302, 303, 307, 308)
        assert "open.feishu.cn" in resp.headers["Location"]
        assert "app_id=cli_test" in resp.headers["Location"]
        assert parse_qs(urlparse(resp.headers["Location"]).query).get("state")
        assert "cubic3_feishu_oauth_state" in resp.headers.get("Set-Cookie", "")

    def test_authorize_without_app_id_returns_500(self, client_no_auth, app):
        app.config["FEISHU_APP_ID"] = ""
        resp = client_no_auth.get("/api/v1/auth/feishu/authorize")
        assert resp.status_code == 500
        assert resp.get_json()["code"] != 0


@pytest.mark.redesign
class TestFeishuCallback:
    def test_callback_grants_default_m2_for_cubic3_allowlist_user(self, client_no_auth, app):
        app.config["APP_BASE_URL"] = "http://frontend.local"
        app.config["FEISHU_APP_ID"] = "cli_test"
        app.config["FEISHU_M2_READER_OPEN_IDS"] = ""
        app.config["FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST"] = True
        state = _authorize_state(client_no_auth)

        with patch("app.infrastructure.adapters.feishu.auth_client.FeishuAuthClient") as feishu_client, \
            patch(
                "app.application.agent.agent_factory.get_data_agent_config",
                return_value={"allowed_user_ids": ["on_m2_user"]},
            ):
            feishu_client.return_value.get_user_access_token.return_value = {"access_token": "user_access_token"}
            feishu_client.return_value.get_user_info.return_value = {
                "open_id": "on_m2_user",
                "union_id": "un_m2_user",
                "tenant_key": "tenant_a",
                "name": "M2 白名单用户",
            }

            resp = client_no_auth.get(f"/api/v1/auth/feishu/callback?code=ok&state={state}")

        assert resp.status_code in (301, 302, 303, 307, 308)
        callback_query = parse_qs(urlparse(resp.headers["Location"]).query)
        assert "access_token" not in callback_query
        assert "refresh_token" not in callback_query
        exchange_resp = client_no_auth.post(
            "/api/v1/auth/feishu/exchange",
            json={"code": callback_query["code"][0]},
        )
        assert exchange_resp.status_code == 200
        access_token = exchange_resp.get_json()["data"]["access_token"]
        me = client_no_auth.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me.status_code == 200
        data = me.get_json()["data"]
        assert data["principal_id"] == "feishu:tenant_a:un_m2_user"
        assert data["platform_roles"] == ["viewer"]
        assert data["data_roles"] == ["data_m0_reader", "data_m1_reader", "data_m2_detail_reader"]
        assert "access.read" not in data["permissions"]
        assert data["access_roles"] == [
            "viewer",
            "data_m0_reader",
            "data_m1_reader",
            "data_m2_detail_reader",
        ]

    def test_callback_keeps_non_allowlist_user_as_viewer_without_data_roles(self, client_no_auth, app):
        app.config["APP_BASE_URL"] = "http://frontend.local"
        app.config["FEISHU_APP_ID"] = "cli_test"
        app.config["FEISHU_M2_READER_OPEN_IDS"] = ""
        app.config["FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST"] = True
        state = _authorize_state(client_no_auth)

        with patch("app.infrastructure.adapters.feishu.auth_client.FeishuAuthClient") as feishu_client, \
            patch(
                "app.application.agent.agent_factory.get_data_agent_config",
                return_value={"allowed_user_ids": ["on_m2_user"]},
            ):
            feishu_client.return_value.get_user_access_token.return_value = {"access_token": "user_access_token"}
            feishu_client.return_value.get_user_info.return_value = {
                "open_id": "on_regular_user",
                "union_id": "un_regular_user",
                "tenant_key": "tenant_a",
                "name": "普通用户",
            }

            resp = client_no_auth.get(f"/api/v1/auth/feishu/callback?code=ok&state={state}")

        assert resp.status_code in (301, 302, 303, 307, 308)
        callback_query = parse_qs(urlparse(resp.headers["Location"]).query)
        assert "access_token" not in callback_query
        assert "refresh_token" not in callback_query
        exchange_resp = client_no_auth.post(
            "/api/v1/auth/feishu/exchange",
            json={"code": callback_query["code"][0]},
        )
        assert exchange_resp.status_code == 200
        access_token = exchange_resp.get_json()["data"]["access_token"]
        me = client_no_auth.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me.status_code == 200
        data = me.get_json()["data"]
        assert data["principal_id"] == "feishu:tenant_a:un_regular_user"
        assert data["platform_roles"] == ["viewer"]
        assert data["data_roles"] == []
        assert data["permissions"] == []

    def test_cli_callback_returns_cli_code_and_exchange_requires_cli_client(self, client_no_auth, app):
        app.config["APP_BASE_URL"] = "http://frontend.local"
        app.config["FEISHU_APP_ID"] = "cli_test"
        state = _authorize_state(client_no_auth, client_type="cli")

        with patch("app.infrastructure.adapters.feishu.auth_client.FeishuAuthClient") as feishu_client:
            feishu_client.return_value.get_user_access_token.return_value = {"access_token": "user_access_token"}
            feishu_client.return_value.get_user_info.return_value = {
                "open_id": "on_cli_user",
                "union_id": "un_cli_user",
                "tenant_key": "tenant_a",
                "name": "CLI 用户",
            }

            resp = client_no_auth.get(f"/api/v1/auth/feishu/callback?code=ok&state={state}")

        assert resp.status_code in (301, 302, 303, 307, 308)
        callback_query = parse_qs(urlparse(resp.headers["Location"]).query)
        assert "cli_code" in callback_query
        assert "access_token" not in callback_query
        assert "refresh_token" not in callback_query
        web_exchange = client_no_auth.post(
            "/api/v1/auth/feishu/exchange",
            json={"code": callback_query["cli_code"][0]},
        )
        assert web_exchange.status_code == 401
        cli_exchange = client_no_auth.post(
            "/api/v1/auth/feishu/exchange",
            json={"code": callback_query["cli_code"][0]},
            headers={"X-C3-Client-Type": "cli"},
        )
        assert cli_exchange.status_code == 200
        assert cli_exchange.get_json()["data"]["refresh_token"]


def _authorize_state(client_no_auth, *, client_type: str = "web") -> str:
    path = "/api/v1/auth/feishu/authorize"
    if client_type == "cli":
        path += "?client=cli"
    resp = client_no_auth.get(path)
    assert resp.status_code in (301, 302, 303, 307, 308)
    return parse_qs(urlparse(resp.headers["Location"]).query)["state"][0]
