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


# ============================================================================
# Round 4 · R-001-P17c: Run rerun + logs
# ============================================================================
@pytest.mark.redesign
class TestRerunRun:
    def test_rerun_happy(self, client):
        src_run = MagicMock()
        src_run.id = 9001
        src_run.task_id = 201
        repo = MagicMock()
        repo.find_run_by_id.return_value = src_run

        exec_handler = MagicMock()
        exec_handler.handle.return_value = {
            "run_id": 9002,
            "status": "pending",
            "message": "Task queued for execution",
            "job_id": "job-abc",
        }

        container = _mock_container(
            extraction_repository=repo,
            execute_task_handler=exec_handler,
        )
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ), patch(
            "app.infrastructure.cache.redis_client.get_redis_client",
            return_value=MagicMock(),
        ):
            resp = client.post(f"{BASE}/runs/9001/rerun")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["run_id"] == 9002
        assert data["source_run_id"] == 9001
        assert data["task_id"] == 201
        assert data["status"] == "pending"
        assert data["job_id"] == "job-abc"

    def test_rerun_missing_returns_404(self, client):
        repo = MagicMock()
        repo.find_run_by_id.return_value = None
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.post(f"{BASE}/runs/9999/rerun")

        assert resp.status_code == 404
        body = resp.get_json()
        assert body["code"] != 0

    def test_rerun_requires_auth(self, client_no_auth):
        resp = client_no_auth.post(f"{BASE}/runs/9001/rerun")
        assert resp.status_code == 401


@pytest.mark.redesign
class TestRunLogs:
    def _make_run(self, **overrides):
        from datetime import datetime

        from app.shared.enums import TaskStatus

        run = MagicMock()
        run.id = 9001
        run.task_id = 201
        run.run_type = "manual"
        run.triggered_by = "tester"
        run.created_at = datetime(2026, 4, 21, 2, 0, 0)
        run.start_time = datetime(2026, 4, 21, 2, 0, 0)
        run.end_time = datetime(2026, 4, 21, 2, 0, 30)
        run.status = TaskStatus.FAILED.value
        run.row_count = 0
        run.result_size_mb = None
        run.duration_ms = 30000
        run.delivery_method = None
        run.error_message = "connection refused"
        run.error_stack = "Traceback…\nConnectionError"
        run.generated_sql = "SELECT 1"
        for k, v in overrides.items():
            setattr(run, k, v)
        return run

    def test_logs_failed_run_includes_start_and_error(self, client):
        run = self._make_run()
        repo = MagicMock()
        repo.find_run_by_id.return_value = run
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/runs/9001/logs")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        items = data["items"]
        assert data["total"] == len(items)
        assert items[0]["level"] == "INFO"
        assert "run#9001" in items[0]["message"]
        assert any(i["level"] == "ERROR" and "connection refused" in i["message"] for i in items)
        # 默认不包含 SQL / stack
        assert not any("SELECT 1" in i["message"] for i in items)
        assert not any("Traceback" in i["message"] for i in items)

    def test_logs_include_sql_and_stack(self, client):
        run = self._make_run()
        repo = MagicMock()
        repo.find_run_by_id.return_value = run
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/runs/9001/logs?include_sql=true&include_stack=true")

        assert resp.status_code == 200
        items = resp.get_json()["data"]["items"]
        assert any("SELECT 1" in i["message"] and i["level"] == "DEBUG" for i in items)
        assert any("Traceback" in i["message"] and i["level"] == "ERROR" for i in items)

    def test_logs_levels_filter(self, client):
        run = self._make_run()
        repo = MagicMock()
        repo.find_run_by_id.return_value = run
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/runs/9001/logs?levels=ERROR")

        assert resp.status_code == 200
        items = resp.get_json()["data"]["items"]
        assert items, "expected at least one ERROR line"
        assert all(i["level"] == "ERROR" for i in items)

    def test_logs_missing_returns_404(self, client):
        repo = MagicMock()
        repo.find_run_by_id.return_value = None
        container = _mock_container(extraction_repository=repo)
        with patch(
            "app.interfaces.api.v1.extraction.get_app_container",
            return_value=container,
        ):
            resp = client.get(f"{BASE}/runs/9999/logs")
        assert resp.status_code == 404

    def test_logs_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(f"{BASE}/runs/9001/logs")
        assert resp.status_code == 401
