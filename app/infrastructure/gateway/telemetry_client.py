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
        return self._get("/api/v1/telemetry/gateway/summary")

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
    ) -> dict[str, Any]:
        response = requests.post(
            f"{self._base_url}/api/v1/queries",
            json={
                "sql": sql,
                "project": _default_project(access_context),
                "wait_for_completion": wait_for_completion,
                "access_context": access_context,
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
