# tests/integration/users/test_preferences.py
"""
B-back-1 · 用户偏好接口集成测试

覆盖路径：
  GET  /api/v1/users/me/preferences
  PUT  /api/v1/users/me/preferences

矩阵：happy / boundary / error
"""
import pytest
import jwt
from datetime import datetime, timedelta, timezone

BASE = "/api/v1/users/me/preferences"


def _make_token(user_id: int = 1, secret: str = "your-secret-key") -> str:
    payload = {
        "user_id": user_id,
        "user_name": "test_user",
        "roles": [],
        "iat": datetime.now(tz=timezone.utc),
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def auth_headers(app):
    secret = app.config.get("JWT_SECRET", "your-secret-key")
    token = _make_token(user_id=1, secret=secret)
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# Happy Path
# ===========================================================================


@pytest.mark.redesign
class TestGetPreferencesHappy:
    def test_get_default_when_absent(self, client, auth_headers):
        """GET 未配置 → 返回默认值，不 404。"""
        resp = client.get(BASE, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["theme"] == "system"
        assert data["default_landing"] == "/dashboard"
        assert data["list_page_size"] == 20
        assert data["table_density"] == "comfortable"
        assert isinstance(data["extra"], dict)
        # 未持久化时 updated_at 为 None
        assert data["updated_at"] is None

    def test_get_after_put_returns_saved(self, client, auth_headers):
        """PUT 之后 GET 返回持久化值。"""
        client.put(BASE, json={"theme": "dark"}, headers=auth_headers)
        resp = client.get(BASE, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["data"]["theme"] == "dark"


# ===========================================================================
# Boundary
# ===========================================================================


@pytest.mark.redesign
class TestPutPreferencesBoundary:
    def test_put_partial_merges(self, client, auth_headers):
        """PUT 仅含 theme → 其余字段保持默认值，不覆盖。"""
        client.put(BASE, json={"theme": "light"}, headers=auth_headers)
        resp = client.get(BASE, headers=auth_headers)
        data = resp.get_json()["data"]
        assert data["theme"] == "light"
        assert data["list_page_size"] == 20  # 未改动，仍是默认

    def test_put_multiple_fields_merges_each(self, client, auth_headers):
        """PUT 多字段 → 均被更新，未传字段不变。"""
        client.put(
            BASE,
            json={"theme": "dark", "list_page_size": 50},
            headers=auth_headers,
        )
        # 再次只更新 table_density，不传 theme / list_page_size
        client.put(BASE, json={"table_density": "compact"}, headers=auth_headers)
        data = client.get(BASE, headers=auth_headers).get_json()["data"]
        assert data["theme"] == "dark"
        assert data["list_page_size"] == 50
        assert data["table_density"] == "compact"

    def test_put_large_page_size_boundary(self, client, auth_headers):
        """PUT list_page_size=200（上界）→ 合法。"""
        resp = client.put(BASE, json={"list_page_size": 200}, headers=auth_headers)
        assert resp.status_code == 200

    def test_put_min_page_size_boundary(self, client, auth_headers):
        """PUT list_page_size=5（下界）→ 合法。"""
        resp = client.put(BASE, json={"list_page_size": 5}, headers=auth_headers)
        assert resp.status_code == 200

    def test_put_extra_json_stored(self, client, auth_headers):
        """PUT extra 任意 JSON → 原样存储。"""
        payload = {"key": "val", "nested": {"a": 1}}
        client.put(BASE, json={"extra": payload}, headers=auth_headers)
        data = client.get(BASE, headers=auth_headers).get_json()["data"]
        assert data["extra"] == payload


# ===========================================================================
# Error
# ===========================================================================


@pytest.mark.redesign
class TestPutPreferencesError:
    def test_put_invalid_theme_returns_422(self, client, auth_headers):
        """PUT theme=invalid → 422。"""
        resp = client.put(BASE, json={"theme": "invalid"}, headers=auth_headers)
        assert resp.status_code == 422

    def test_put_invalid_table_density_returns_422(self, client, auth_headers):
        """PUT table_density=ultra → 422。"""
        resp = client.put(BASE, json={"table_density": "ultra"}, headers=auth_headers)
        assert resp.status_code == 422

    def test_put_page_size_too_large_returns_422(self, client, auth_headers):
        """PUT list_page_size=9999（超上界）→ 422。"""
        resp = client.put(BASE, json={"list_page_size": 9999}, headers=auth_headers)
        assert resp.status_code == 422

    def test_put_default_landing_without_leading_slash_returns_422(self, client, auth_headers):
        """PUT default_landing 不以 / 开头 → 422（触发 validator）。"""
        resp = client.put(BASE, json={"default_landing": "dashboard"}, headers=auth_headers)
        assert resp.status_code == 422

    def test_put_default_landing_with_leading_slash_ok(self, client, auth_headers):
        """PUT default_landing 以 / 开头 → 200，validator 通过分支。"""
        resp = client.put(BASE, json={"default_landing": "/data/sources"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["data"]["default_landing"] == "/data/sources"

    def test_get_without_auth_returns_401(self, client_no_auth):
        """GET 无 token → 401。"""
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401

    def test_put_without_auth_returns_401(self, client_no_auth):
        """PUT 无 token → 401。"""
        resp = client_no_auth.put(BASE, json={"theme": "dark"})
        assert resp.status_code == 401
