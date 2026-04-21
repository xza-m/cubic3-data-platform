# tests/integration/auth/test_auth_api.py
"""
W5.B · Auth API 集成测试

走真实 Flask app（``client`` / ``client_no_auth`` fixture）。

覆盖路径：
  POST /api/v1/auth/login                → 登录（参数 / 引导账户回退）
  GET  /api/v1/auth/me                   → 当前用户（含 401）
  GET  /api/v1/auth/feishu/authorize     → 飞书 SSO 跳转

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import patch

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
        """数据库为空 + 配置有 ADMIN_USERNAME/PASSWORD 时，可登录拿到 token。"""
        app.config["ADMIN_USERNAME"] = "boot_admin"
        app.config["ADMIN_PASSWORD"] = "boot_pass"
        with patch(
            "app.interfaces.api.v1.auth._user_service",
            return_value=None,
        ):
            resp = client_no_auth.post(
                "/api/v1/auth/login",
                json={"username": "boot_admin", "password": "boot_pass"},
            )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert "token" in body["data"]
        assert isinstance(body["data"]["token"], str)
        assert len(body["data"]["token"]) > 20

    def test_login_bootstrap_wrong_password_returns_401(self, client_no_auth, app):
        app.config["ADMIN_USERNAME"] = "boot_admin"
        app.config["ADMIN_PASSWORD"] = "boot_pass"
        with patch(
            "app.interfaces.api.v1.auth._user_service",
            return_value=None,
        ):
            resp = client_no_auth.post(
                "/api/v1/auth/login",
                json={"username": "boot_admin", "password": "wrong"},
            )

        assert resp.status_code == 401
        assert resp.get_json()["code"] != 0


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

    def test_me_without_token_returns_401(self, client_no_auth):
        resp = client_no_auth.get("/api/v1/auth/me")
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

    def test_authorize_without_app_id_returns_500(self, client_no_auth, app):
        app.config["FEISHU_APP_ID"] = ""
        resp = client_no_auth.get("/api/v1/auth/feishu/authorize")
        assert resp.status_code == 500
        assert resp.get_json()["code"] != 0
