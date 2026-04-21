# tests/integration/app_executions/test_app_executions_api.py
"""
W5.B · App Executions API 集成测试

覆盖路径：
  GET /api/v1/app-executions             → 列表
  GET /api/v1/app-executions/<id>        → 详情（happy & 404）
  GET /api/v1/app-executions/stats       → 统计

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

BASE = "/api/v1/app-executions"


def _mock_container(service: MagicMock) -> MagicMock:
    container = MagicMock()
    container.execution_service.return_value = service
    return container


@pytest.mark.redesign
class TestListExecutions:
    def test_list_executions_happy(self, client):
        svc = MagicMock()
        svc.list_executions.return_value = {
            "items": [{"id": 1, "app_code": "report", "status": "success"}],
            "total": 1,
            "page": 1,
            "page_size": 20,
        }
        with patch(
            "app.interfaces.api.v1.app_executions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}?app_code=report&page=1&page_size=20")

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["total"] == 1
        assert body["data"]["items"][0]["status"] == "success"

    def test_list_passes_filter_kwargs(self, client):
        svc = MagicMock()
        svc.list_executions.return_value = {
            "items": [], "total": 0, "page": 2, "page_size": 5
        }
        with patch(
            "app.interfaces.api.v1.app_executions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(
                f"{BASE}?app_code=cube&instance_id=99&status=failed"
                "&trigger_type=manual&page=2&page_size=5"
            )

        assert resp.status_code == 200
        kwargs = svc.list_executions.call_args.kwargs
        assert kwargs["app_code"] == "cube"
        assert kwargs["instance_id"] == 99
        assert kwargs["status"] == "failed"
        assert kwargs["trigger_type"] == "manual"
        assert kwargs["page"] == 2
        assert kwargs["page_size"] == 5


@pytest.mark.redesign
class TestGetExecution:
    def test_get_execution_happy(self, client):
        svc = MagicMock()
        svc.get_execution.return_value = {"id": 7, "app_code": "report", "status": "success"}
        with patch(
            "app.interfaces.api.v1.app_executions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}/7")

        assert resp.status_code == 200
        assert resp.get_json()["data"]["id"] == 7

    def test_get_execution_missing_returns_404(self, client):
        svc = MagicMock()
        svc.get_execution.return_value = None
        with patch(
            "app.interfaces.api.v1.app_executions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}/9999")

        assert resp.status_code == 404
        body = resp.get_json()
        assert body["code"] != 0


@pytest.mark.redesign
class TestExecutionStats:
    def test_get_stats_happy(self, client):
        svc = MagicMock()
        svc.get_execution_stats.return_value = {"total": 100, "success": 80, "failed": 20}
        with patch(
            "app.interfaces.api.v1.app_executions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}/stats?days=30")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["total"] == 100
        svc.get_execution_stats.assert_called_once_with(instance_id=None, days=30)


@pytest.mark.redesign
class TestExecutionsAuth:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401
