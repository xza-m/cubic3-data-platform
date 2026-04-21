# app/application/datasource/handlers/test_connection_handler.py
"""
测试数据源连接处理器（B-back-4 增强版）

变更：
  - 计时 latency_ms
  - 返回 tested_at（ISO 8601）
  - 成功时附 details.{server_version, tls}
  - 失败时附 error_code、error_message、hint
  - 不破坏原有 success/message/details 结构
"""
from __future__ import annotations

import socket
import time
from datetime import datetime, timezone
from typing import Any, Dict

from app.application.datasource.queries.test_connection import TestConnectionQuery
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# 错误分类常量
# ---------------------------------------------------------------------------
_EC_TIMEOUT = "CONNECTION_TIMEOUT"
_EC_AUTH_FAILED = "AUTH_FAILED"
_EC_HOST_UNREACHABLE = "HOST_UNREACHABLE"
_EC_UNKNOWN = "UNKNOWN"

_HINTS: Dict[str, str] = {
    _EC_TIMEOUT: "请检查网络连通性与白名单规则，或适当延长超时时间",
    _EC_AUTH_FAILED: "请检查用户名、密码或 Access Key 是否正确",
    _EC_HOST_UNREACHABLE: "请确认主机地址与端口是否可达，检查防火墙规则",
    _EC_UNKNOWN: "请查看服务端日志获取更多信息",
}


def _classify_error(exc: Exception) -> str:
    """将异常映射到错误分类码。"""
    msg = str(exc).lower()
    cls_name = type(exc).__name__.lower()

    if any(kw in msg for kw in ("timeout", "timed out", "read timed out")):
        return _EC_TIMEOUT
    if any(kw in msg or kw in cls_name for kw in ("auth", "authentication", "credential", "password", "access denied", "access key")):
        return _EC_AUTH_FAILED
    if isinstance(exc, (socket.gaierror, ConnectionRefusedError, OSError)):
        return _EC_HOST_UNREACHABLE
    if any(kw in msg for kw in ("connection refused", "no route", "unreachable", "name or service")):
        return _EC_HOST_UNREACHABLE
    return _EC_UNKNOWN


class TestConnectionHandler:
    """测试数据源连接处理器（B-back-4 增强版）"""

    def __init__(self, repository: IDatasourceRepository) -> None:
        self.repository = repository

    def _normalize_connection_config(
        self, source_type: str, config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """规范化连接配置，兼容前端字段命名。"""
        normalized = config.copy()
        if source_type == "maxcompute":
            if "access_key_id" in normalized:
                normalized["access_id"] = normalized.pop("access_key_id")
            if "access_key_secret" in normalized:
                normalized["access_key"] = normalized.pop("access_key_secret")
        return normalized

    def handle(self, query: TestConnectionQuery) -> Dict[str, Any]:
        """
        测试数据源连接。

        Returns（成功）:
            {
                "ok": True,
                "success": True,          # 向后兼容
                "message": "连接成功",
                "latency_ms": 134,
                "tested_at": "2026-...",
                "details": {
                    "server_version": "...",
                    "tls": False
                }
            }

        Returns（失败）:
            {
                "ok": False,
                "success": False,
                "message": "...",
                "latency_ms": 7000,
                "tested_at": "2026-...",
                "error_code": "CONNECTION_TIMEOUT",
                "error_message": "...",
                "hint": "..."
            }
        """
        datasource = self.repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")

        tested_at = datetime.now(tz=timezone.utc).isoformat()
        t_start = time.perf_counter()

        try:
            normalized_config = self._normalize_connection_config(
                datasource.source_type, datasource.connection_config
            )
            adapter = AdapterFactory.create_adapter(datasource.source_type, normalized_config)
            raw_result = adapter.test_connection()
            latency_ms = int((time.perf_counter() - t_start) * 1000)

            if raw_result.get("success"):
                datasource.mark_test_success()
                self.repository.save(datasource)

                raw_details = raw_result.get("details") or {}
                details = {
                    "server_version": raw_details.get("server_version") or raw_result.get("server_version"),
                    "tls": bool(raw_details.get("tls", raw_result.get("tls", False))),
                }

                return {
                    "ok": True,
                    "success": True,
                    "message": raw_result.get("message", "连接成功"),
                    "latency_ms": latency_ms,
                    "tested_at": tested_at,
                    "details": details,
                }
            else:
                err_msg = raw_result.get("message", "连接失败")
                datasource.mark_test_failed(err_msg)
                self.repository.save(datasource)

                return {
                    "ok": False,
                    "success": False,
                    "message": err_msg,
                    "latency_ms": latency_ms,
                    "tested_at": tested_at,
                    "error_code": _EC_UNKNOWN,
                    "error_message": err_msg,
                    "hint": _HINTS[_EC_UNKNOWN],
                }

        except Exception as exc:
            latency_ms = int((time.perf_counter() - t_start) * 1000)
            error_code = _classify_error(exc)
            error_message = str(exc)

            logger.warning(
                "test_connection_failed",
                datasource_id=query.datasource_id,
                error_code=error_code,
                error=error_message,
            )

            datasource.mark_test_failed(error_message)
            self.repository.save(datasource)

            return {
                "ok": False,
                "success": False,
                "message": f"连接测试失败: {error_message}",
                "latency_ms": latency_ms,
                "tested_at": tested_at,
                "error_code": error_code,
                "error_message": error_message,
                "hint": _HINTS.get(error_code, _HINTS[_EC_UNKNOWN]),
            }
