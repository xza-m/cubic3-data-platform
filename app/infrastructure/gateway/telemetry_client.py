"""dw-query-gateway telemetry client."""

from __future__ import annotations

from typing import Any

import requests


class GatewayTelemetryError(RuntimeError):
    """Gateway telemetry 调用失败。"""


class GatewayQueryError(RuntimeError):
    """Gateway 查询调用失败。"""


class GatewayTelemetryClient:
    """data-platform 只读代理 gateway 可观测数据。"""

    def __init__(self, *, base_url: str, platform_service_token: str, timeout_seconds: int = 5) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = platform_service_token
        self._timeout_seconds = timeout_seconds

    def get_summary(self) -> dict[str, Any]:
        return normalize_gateway_summary(self._get("/api/v1/telemetry/gateway/summary"))

    def list_query_runs(self, *, limit: int = 50) -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/query-runs", params={"limit": limit})

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = requests.get(
            f"{self._base_url}{path}",
            params=params,
            headers={"X-Platform-Service-Token": self._token},
            timeout=self._timeout_seconds,
        )
        if response.status_code >= 400:
            raise GatewayTelemetryError(f"gateway telemetry failed: {response.status_code}")
        payload = response.json()
        if payload.get("success") is False:
            error = payload.get("error") or {}
            raise GatewayTelemetryError(str(error.get("message") or "gateway telemetry failed"))
        return payload.get("data") or {}


class GatewayQueryClient:
    """data-platform 向 dw-query-gateway 下发已授权查询。"""

    def __init__(self, *, base_url: str, platform_service_token: str, timeout_seconds: int = 5) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = platform_service_token
        self._timeout_seconds = timeout_seconds

    def execute_sql(
        self,
        *,
        sql: str,
        access_context: dict[str, Any],
        wait_for_completion: bool = False,
        idempotency_key: str | None = None,
        runtime_options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = requests.post(
            f"{self._base_url}/api/v1/queries",
            json={
                "sql": sql,
                "project": _default_project(access_context),
                "wait_for_completion": wait_for_completion,
                "access_context": access_context,
                "idempotency_key": idempotency_key,
                "runtime_options": runtime_options or {},
            },
            headers={"X-Platform-Service-Token": self._token},
            timeout=self._timeout_seconds,
        )
        if response.status_code >= 400:
            raise GatewayQueryError(f"gateway query failed: {response.status_code}")
        payload = response.json()
        if payload.get("success") is False:
            error = payload.get("error") or {}
            raise GatewayQueryError(str(error.get("message") or "gateway query failed"))
        return payload.get("data") or {}


def _default_project(access_context: dict[str, Any]) -> str | None:
    for item in access_context.get("resource_set_physical") or []:
        if isinstance(item, dict) and item.get("project"):
            return str(item["project"])
    return None


def normalize_gateway_summary(payload: dict[str, Any]) -> dict[str, Any]:
    """规整 gateway 运行态指标，BFF 不重新计算执行事实。"""

    source = dict(payload or {})

    def number(key: str, *aliases: str, default: float = 0) -> float:
        for name in (key, *aliases):
            value = source.get(name)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return default

    query_count = int(number("query_count", "total_count"))
    success_count = int(number("success_count", "succeeded_count"))
    failed_count = int(number("failed_count"))
    stability = source.get("stability")
    if stability is None:
        stability = round((success_count / query_count) * 100, 2) if query_count else 100

    normalized = {
        "query_count": query_count,
        "success_count": success_count,
        "failed_count": failed_count,
        "physical_denied_count": int(number("physical_denied_count")),
        "stability": float(stability),
        "by_data_level": dict(source.get("by_data_level") or {}),
        "queued_count": int(number("queued_count")),
        "running_count": int(number("running_count")),
        "pending_count": int(number("pending_count")),
        "avg_queue_wait_ms": number("avg_queue_wait_ms"),
        "max_current_queue_wait_ms": number("max_current_queue_wait_ms"),
        "avg_execute_ms": number("avg_execute_ms"),
        "remote_timeout_count": int(number("remote_timeout_count")),
        "client_wait_timeout_count": int(number("client_wait_timeout_count")),
        "timeout_count": int(number("timeout_count")),
        "rejected_count": int(number("rejected_count", "reject_count")),
        "result_object_count": int(number("result_object_count")),
        "spool_object_count": int(number("spool_object_count", "spool_result_count")),
        "generated_at": source.get("generated_at"),
    }
    return {**source, **normalized}
