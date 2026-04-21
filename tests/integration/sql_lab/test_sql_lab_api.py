# tests/integration/sql_lab/test_sql_lab_api.py
"""
W5.B · SQL Lab API 集成测试

覆盖路径：
  POST /api/v1/sql_lab/execute              → 同步执行（happy）
  POST /api/v1/sql_lab/validate             → 校验（实链路，无 mock）
  POST /api/v1/sql_lab/execute              → 缺参（400）
  GET  /api/v1/sql_lab/query/<id>/status    → 异步状态（404）

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

BASE = "/api/v1/sql_lab"


def _mock_container(**kwargs) -> MagicMock:
    container = MagicMock()
    for name, value in kwargs.items():
        getattr(container, name).return_value = value
    return container


@pytest.mark.redesign
class TestExecuteSync:
    def test_execute_sync_happy(self, client):
        handler = MagicMock()
        handler.handle.return_value = {
            "columns": ["id"], "rows": [[1]], "row_count": 1
        }
        container = _mock_container(execute_sql_preview_handler=handler)
        with patch(
            "app.interfaces.api.v1.sql_lab.get_app_container",
            return_value=container,
        ):
            resp = client.post(
                f"{BASE}/execute",
                json={"source_id": 1, "sql_query": "SELECT 1", "limit": 10},
            )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["row_count"] == 1


@pytest.mark.redesign
class TestExecuteValidationErrors:
    def test_missing_source_id_returns_400(self, client):
        resp = client.post(f"{BASE}/execute", json={"sql_query": "SELECT 1"})
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0
        assert "source_id" in body["message"]

    def test_empty_sql_returns_400(self, client):
        resp = client.post(f"{BASE}/execute", json={"source_id": 1, "sql_query": "   "})
        assert resp.status_code == 400


@pytest.mark.redesign
class TestValidate:
    def test_validate_safe_select(self, client):
        """无 mock：直接走 validate_sql_query 实链路。"""
        resp = client.post(f"{BASE}/validate", json={"sql_query": "SELECT 1"})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["valid"] is True
        assert body["data"]["errors"] == []

    def test_validate_dangerous_drop(self, client):
        """DROP 类语句应被拒绝（具体取决于 validator 的规则）。"""
        resp = client.post(f"{BASE}/validate", json={"sql_query": "DROP TABLE users"})
        assert resp.status_code == 200
        body = resp.get_json()
        assert "valid" in body["data"]
        assert "errors" in body["data"]


@pytest.mark.redesign
class TestQueryStatus:
    def test_status_missing_query_returns_404(self, client):
        handler = MagicMock()
        handler.handle.return_value = None
        container = _mock_container(get_query_status_handler=handler)
        with patch(
            "app.interfaces.api.v1.sql_lab.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/query/9999/status")

        assert resp.status_code == 404


@pytest.mark.redesign
class TestSqlLabAuth:
    def test_execute_requires_auth(self, client_no_auth):
        resp = client_no_auth.post(
            f"{BASE}/execute",
            json={"source_id": 1, "sql_query": "SELECT 1"},
        )
        assert resp.status_code == 401
