# tests/integration/apps/test_apps_api.py
"""
W5.B · Apps / Marketplace API 集成测试

覆盖路径：
  GET  /api/v1/apps                 → 列表
  GET  /api/v1/apps/<code>         → 详情（happy & 404）
  POST /api/v1/apps/<code>/validate → 配置校验

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

BASE = "/api/v1/apps"


def _mock_container(service: MagicMock) -> MagicMock:
    container = MagicMock()
    container.app_definition_service.return_value = service
    return container


@pytest.mark.redesign
class TestAppsList:
    def test_list_apps_returns_envelope(self, client):
        svc = MagicMock()
        svc.get_all_apps.return_value = [
            {"code": "report", "name": "报表助手", "category": "BI", "enabled": True}
        ]
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(BASE)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)
        assert body["data"][0]["code"] == "report"

    def test_list_apps_passes_filter_args(self, client):
        svc = MagicMock()
        svc.get_all_apps.return_value = []
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}?category=ETL&enabled_only=false&include_stats=true")

        assert resp.status_code == 200
        svc.get_all_apps.assert_called_once_with(
            category="ETL", enabled_only=False, include_stats=True
        )


@pytest.mark.redesign
class TestAppsDetail:
    def test_get_app_happy(self, client):
        svc = MagicMock()
        svc.get_app_by_code.return_value = {"code": "report", "name": "报表助手"}
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}/report")

        assert resp.status_code == 200
        assert resp.get_json()["data"]["code"] == "report"

    def test_get_app_missing_returns_404(self, client):
        svc = MagicMock()
        svc.get_app_by_code.return_value = None
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}/does_not_exist")

        assert resp.status_code == 404
        body = resp.get_json()
        assert body["code"] != 0
        assert "does_not_exist" in body["message"]


@pytest.mark.redesign
class TestAppsValidate:
    def test_validate_returns_validation_result(self, client):
        svc = MagicMock()
        svc.validate_app_config.return_value = (True, [])
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(
                f"{BASE}/report/validate",
                json={"config": {"foo": "bar"}},
            )

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["is_valid"] is True
        assert data["errors"] == []


@pytest.mark.redesign
class TestAppsAuth:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401


@pytest.mark.redesign
class TestAppsAdminOps:
    """应用启用/停用为治理边界操作，仅管理员可执行。"""

    def test_enable_forbidden_for_non_admin(self, client_no_auth, viewer_headers):
        resp = client_no_auth.post(f"{BASE}/report/enable", headers=viewer_headers)
        assert resp.status_code == 403

    def test_disable_forbidden_for_non_admin(self, client_no_auth, viewer_headers):
        resp = client_no_auth.post(f"{BASE}/report/disable", headers=viewer_headers)
        assert resp.status_code == 403

    def test_enable_unauthenticated_returns_401(self, client_no_auth):
        resp = client_no_auth.post(f"{BASE}/report/enable")
        assert resp.status_code == 401

    def test_enable_allows_admin(self, client):
        svc = MagicMock()
        svc.set_enabled.return_value = {"code": "report", "enabled": True}
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(f"{BASE}/report/enable")

        assert resp.status_code == 200
        svc.set_enabled.assert_called_once_with("report", True)

    def test_disable_allows_admin(self, client):
        svc = MagicMock()
        svc.set_enabled.return_value = {"code": "report", "enabled": False}
        with patch(
            "app.interfaces.api.v1.apps.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(f"{BASE}/report/disable")

        assert resp.status_code == 200
        svc.set_enabled.assert_called_once_with("report", False)
