# tests/integration/extraction/test_extraction_api.py
"""
W5.B · Extraction（抽取任务 / 运行）API 集成测试

覆盖路径：
  GET  /api/v1/extraction/tasks               → 任务列表（happy）
  GET  /api/v1/extraction/runs                → 运行记录（happy）
  GET  /api/v1/extraction/runs/<id>/download  → 下载（404 boundary）
  POST /api/v1/extraction/tasks               → 创建（400 参数）
  GET  /api/v1/extraction/health              → 健康检查（不需要认证）

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

BASE = "/api/v1/extraction"


def _mock_container(**provider_kwargs) -> MagicMock:
    container = MagicMock()
    for name, value in provider_kwargs.items():
        getattr(container, name).return_value = value
    return container


@pytest.mark.redesign
class TestListTasks:
    def test_list_tasks_happy(self, client):
        item = MagicMock()
        item.model_dump.return_value = {"id": 1, "task_name": "demo"}
        handler = MagicMock()
        handler.handle.return_value = {
            "items": [item],
            "total": 1,
            "page": 1,
            "page_size": 20,
            "total_pages": 1,
        }
        container = _mock_container(list_tasks_handler=handler)
        # 旁路 redis 缓存装饰器：直接执行内层函数
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ), patch(
            "app.infrastructure.cache.decorators.query_cache",
            return_value=lambda fn: fn,
        ):
            resp = client.get(f"{BASE}/tasks")

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["total"] == 1
        assert body["data"]["items"][0]["task_name"] == "demo"


@pytest.mark.redesign
class TestListRuns:
    def test_list_runs_happy(self, client):
        run = MagicMock()
        run.to_dict.return_value = {"id": 11, "task_id": 1, "status": "success"}
        repo = MagicMock()
        repo.list_runs.return_value = {"items": [run], "total": 1}
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/runs?page=1&page_size=20")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["status"] == "success"


@pytest.mark.redesign
class TestDownloadRun:
    def test_download_missing_returns_404(self, client):
        repo = MagicMock()
        repo.find_run_by_id.return_value = None
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/runs/9999/download")

        assert resp.status_code == 404
        body = resp.get_json()
        assert body["code"] != 0


@pytest.mark.redesign
class TestCreateTaskValidation:
    def test_create_invalid_payload_returns_400(self, client):
        """缺少 task_name / dataset_id → Pydantic 校验失败 → 400。"""
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=_mock_container(),
        ):
            resp = client.post(f"{BASE}/tasks", json={})

        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0
        assert body.get("details") is not None


@pytest.mark.redesign
class TestExtractionHealth:
    def test_health_route_registered(self, client_no_auth):
        """/extraction/health 不需要认证（健康端点）。"""
        resp = client_no_auth.get(f"{BASE}/health")
        # 200/503 都属于"已注册"；只要不是 404/401 即可
        assert resp.status_code != 404
        assert resp.status_code != 401


@pytest.mark.redesign
class TestExtractionAuth:
    def test_list_tasks_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(f"{BASE}/tasks")
        assert resp.status_code == 401
