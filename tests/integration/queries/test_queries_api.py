# tests/integration/queries/test_queries_api.py
"""
W5.B · Queries（保存查询 / Console）API 集成测试

覆盖路径：
  POST /api/v1/queries/execute        → 执行（happy）
  GET  /api/v1/queries                → 列表
  GET  /api/v1/queries/<id>           → 详情（404）
  POST /api/v1/queries/<id>/favorite  → 切换收藏（404）

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.shared.exceptions import EntityNotFoundError

BASE = "/api/v1/queries"


def _mock_container(**handlers) -> MagicMock:
    container = MagicMock()
    for name, handler in handlers.items():
        getattr(container, name).return_value = handler
    return container


@pytest.mark.redesign
class TestExecuteQuery:
    def test_execute_happy(self, client):
        handler = MagicMock()
        handler.handle.return_value = {
            "columns": ["id"], "rows": [[1], [2]], "row_count": 2
        }
        container = _mock_container(execute_query_handler=handler)
        with patch(
            "app.interfaces.api.v1.queries.get_app_container",
            return_value=container,
        ):
            resp = client.post(
                f"{BASE}/execute",
                json={"source_id": 1, "sql_query": "SELECT 1", "limit": 100},
            )

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["row_count"] == 2

    def test_execute_validation_error(self, client):
        """缺少 source_id → Pydantic ValidationError → 400。"""
        with patch(
            "app.interfaces.api.v1.queries.get_app_container",
            return_value=_mock_container(),
        ):
            resp = client.post(f"{BASE}/execute", json={"sql_query": "SELECT 1"})

        assert resp.status_code == 400
        assert resp.get_json()["code"] != 0


@pytest.mark.redesign
class TestListQueries:
    def test_list_happy(self, client):
        handler = MagicMock()
        handler.handle.return_value = {
            "items": [{"id": 1, "query_name": "demo"}],
            "total": 1,
            "page": 1,
            "page_size": 20,
        }
        container = _mock_container(list_queries_handler=handler)
        with patch(
            "app.interfaces.api.v1.queries.get_app_container",
            return_value=container,
        ):
            resp = client.get(BASE)

        assert resp.status_code == 200
        assert resp.get_json()["data"]["total"] == 1


@pytest.mark.redesign
class TestGetQuery:
    def test_get_missing_returns_404(self, client):
        handler = MagicMock()
        handler.handle.side_effect = EntityNotFoundError("查询不存在")
        container = _mock_container(get_query_handler=handler)
        with patch(
            "app.interfaces.api.v1.queries.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/9999")

        assert resp.status_code == 404
        assert resp.get_json()["code"] != 0


@pytest.mark.redesign
class TestToggleFavorite:
    def test_toggle_favorite_missing_returns_404(self, client):
        handler = MagicMock()
        handler.handle.side_effect = EntityNotFoundError("查询不存在")
        container = _mock_container(toggle_favorite_handler=handler)
        with patch(
            "app.interfaces.api.v1.queries.get_app_container",
            return_value=container,
        ):
            resp = client.post(f"{BASE}/9999/favorite")

        assert resp.status_code == 404


@pytest.mark.redesign
class TestQueriesAuth:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401
