# tests/integration/datasources/test_test_connection.py
"""
B-back-4 · 数据源测试连接增强集成测试

覆盖路径：
  POST /api/v1/data-center/datasources/:id/test

矩阵：happy / boundary / error
"""
from __future__ import annotations

import socket
import pytest
from unittest.mock import MagicMock, patch

BASE = "/api/v1/data-center/datasources"


def _mock_handler(return_value: dict):
    """构造返回指定结果的 mock handler 工厂函数。"""
    handler = MagicMock()
    handler.handle.return_value = return_value
    container = MagicMock()
    container.test_connection_handler.return_value = handler
    return container


# ===========================================================================
# Happy Path
# ===========================================================================


@pytest.mark.redesign
class TestTestConnectionHappy:
    def test_success_returns_enhanced_fields(self, client):
        """成功时响应含 ok/latency_ms/tested_at/details。"""
        result = {
            "ok": True,
            "success": True,
            "message": "连接成功",
            "latency_ms": 42,
            "tested_at": "2026-04-20T00:00:00+00:00",
            "details": {"server_version": "8.0.32", "tls": False},
        }
        with patch(
            "app.interfaces.api.v1.datasources.get_app_container",
            return_value=_mock_handler(result),
        ):
            resp = client.post(f"{BASE}/1/test")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["ok"] is True
        assert isinstance(data["latency_ms"], int)
        assert data["latency_ms"] == 42
        assert "tested_at" in data
        assert "details" in data
        assert "server_version" in data["details"]
        assert "tls" in data["details"]

    def test_success_details_tls_field_is_bool(self, client):
        """details.tls 为布尔型。"""
        result = {
            "ok": True,
            "success": True,
            "message": "ok",
            "latency_ms": 10,
            "tested_at": "2026-04-20T00:00:00+00:00",
            "details": {"server_version": None, "tls": True},
        }
        with patch(
            "app.interfaces.api.v1.datasources.get_app_container",
            return_value=_mock_handler(result),
        ):
            resp = client.post(f"{BASE}/1/test")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert isinstance(data["details"]["tls"], bool)


# ===========================================================================
# Boundary
# ===========================================================================


@pytest.mark.redesign
class TestTestConnectionBoundary:
    def test_route_registered(self, client):
        """路由已注册（非 404）。"""
        resp = client.post(f"{BASE}/1/test")
        assert resp.status_code != 404

    def test_large_latency_ms_returned(self, client):
        """latency_ms 可以是大值（超时场景）。"""
        result = {
            "ok": False,
            "success": False,
            "message": "超时",
            "latency_ms": 30_000,
            "tested_at": "2026-04-20T00:00:00+00:00",
            "error_code": "CONNECTION_TIMEOUT",
            "error_message": "read timed out",
            "hint": "请检查网络",
        }
        with patch(
            "app.interfaces.api.v1.datasources.get_app_container",
            return_value=_mock_handler(result),
        ):
            resp = client.post(f"{BASE}/1/test")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["latency_ms"] == 30_000


# ===========================================================================
# Error
# ===========================================================================


@pytest.mark.redesign
class TestTestConnectionError:
    def test_connection_timeout_returns_error_code(self, client):
        """mock connector 抛超时 → error_code=CONNECTION_TIMEOUT。"""
        result = {
            "ok": False,
            "success": False,
            "message": "连接测试失败: read timed out",
            "latency_ms": 7000,
            "tested_at": "2026-04-20T00:00:00+00:00",
            "error_code": "CONNECTION_TIMEOUT",
            "error_message": "read timed out",
            "hint": "请检查网络连通性与白名单规则，或适当延长超时时间",
        }
        with patch(
            "app.interfaces.api.v1.datasources.get_app_container",
            return_value=_mock_handler(result),
        ):
            resp = client.post(f"{BASE}/1/test")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["ok"] is False
        assert data["error_code"] == "CONNECTION_TIMEOUT"
        assert "hint" in data
        assert data["hint"]

    def test_auth_failed_returns_error_code(self, client):
        """认证失败 → error_code=AUTH_FAILED。"""
        result = {
            "ok": False,
            "success": False,
            "message": "连接测试失败: authentication failed",
            "latency_ms": 300,
            "tested_at": "2026-04-20T00:00:00+00:00",
            "error_code": "AUTH_FAILED",
            "error_message": "authentication failed",
            "hint": "请检查用户名、密码或 Access Key 是否正确",
        }
        with patch(
            "app.interfaces.api.v1.datasources.get_app_container",
            return_value=_mock_handler(result),
        ):
            resp = client.post(f"{BASE}/1/test")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["error_code"] == "AUTH_FAILED"

    def test_handler_error_classification_timeout(self):
        """TestConnectionHandler._classify_error 正确分类超时异常。"""
        from app.application.datasource.handlers.test_connection_handler import _classify_error

        exc = TimeoutError("read timed out after 30s")
        assert _classify_error(exc) == "CONNECTION_TIMEOUT"

    def test_handler_error_classification_host_unreachable(self):
        """TestConnectionHandler._classify_error 正确分类主机不可达异常。"""
        from app.application.datasource.handlers.test_connection_handler import _classify_error

        exc = socket.gaierror("Name or service not known")
        assert _classify_error(exc) == "HOST_UNREACHABLE"

    def test_handler_error_classification_unknown(self):
        """未知异常 → UNKNOWN。"""
        from app.application.datasource.handlers.test_connection_handler import _classify_error

        exc = RuntimeError("something weird happened")
        assert _classify_error(exc) == "UNKNOWN"

    def test_handler_error_classification_auth_by_message_keyword(self):
        """通过 message 关键字命中 AUTH_FAILED（覆盖 line 51 字符串分支）。"""
        from app.application.datasource.handlers.test_connection_handler import _classify_error

        exc = RuntimeError("password authentication failed for user 'foo'")
        assert _classify_error(exc) == "AUTH_FAILED"

    def test_handler_error_classification_host_unreachable_by_message_keyword(self):
        """通过 message 关键字命中 HOST_UNREACHABLE 而非 isinstance 分支（覆盖 line 55）。"""
        from app.application.datasource.handlers.test_connection_handler import _classify_error

        exc = RuntimeError("connection refused by upstream proxy")
        assert _classify_error(exc) == "HOST_UNREACHABLE"
