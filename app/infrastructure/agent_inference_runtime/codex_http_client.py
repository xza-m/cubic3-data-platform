"""Codex app-server HTTP transport client。"""
from __future__ import annotations

from typing import Any, Mapping
from urllib.parse import urljoin

import requests


class CodexAppServerClientError(RuntimeError):
    """Codex app-server provider 调用失败。

    该错误用于管理面清晰映射 provider 侧异常，避免把网络或响应格式错误泄漏成 500。
    """

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int = 502,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = dict(details or {})


class CodexAppServerHttpClient:
    """调用 Codex app-server 的最小 HTTP 管理接口。

    Task 2 仅接入 health 与 capabilities，不承载 run lifecycle。
    """

    def __init__(
        self,
        *,
        endpoint: str,
        session: Any | None = None,
        timeout_seconds: int | float = 10,
    ) -> None:
        normalized_endpoint = str(endpoint or "").strip()
        if not normalized_endpoint:
            raise CodexAppServerClientError(
                "Codex app-server endpoint 未配置。",
                code="RUNTIME_PROVIDER_CONFIG_INVALID",
                status_code=400,
                details={"field": "endpoint"},
            )
        self._endpoint = normalized_endpoint.rstrip("/") + "/"
        self._session = session or requests.Session()
        self._timeout_seconds = timeout_seconds

    def healthcheck(self) -> dict[str, Any]:
        return self._get_json_object("/health")

    def capabilities(self) -> dict[str, Any]:
        return self._get_json_object("/capabilities")

    def submit_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post_json_object("/runs", payload)

    def poll_run(self, provider_run_id: str) -> dict[str, Any]:
        return self._get_json_object(f"/runs/{provider_run_id}")

    def cancel_run(self, provider_run_id: str) -> dict[str, Any]:
        return self._post_json_object(f"/runs/{provider_run_id}/cancel", {})

    def events(self, provider_run_id: str) -> list[dict[str, Any]]:
        return self._get_json_list(f"/runs/{provider_run_id}/events")

    def artifacts(self, provider_run_id: str) -> list[dict[str, Any]]:
        return self._get_json_list(f"/runs/{provider_run_id}/artifacts")

    def _get_json_object(self, path: str) -> dict[str, Any]:
        payload = self._request_json("GET", path)
        if not isinstance(payload, dict):
            raise CodexAppServerClientError(
                "Codex app-server 返回了非对象 JSON。",
                code="RUNTIME_PROVIDER_RESPONSE_INVALID",
                details={"path": path},
            )
        return payload

    def _post_json_object(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response_payload = self._request_json("POST", path, payload=payload)
        if not isinstance(response_payload, dict):
            raise CodexAppServerClientError(
                "Codex app-server 返回了非对象 JSON。",
                code="RUNTIME_PROVIDER_RESPONSE_INVALID",
                details={"path": path},
            )
        return response_payload

    def _get_json_list(self, path: str) -> list[dict[str, Any]]:
        payload = self._request_json("GET", path)
        if isinstance(payload, dict) and "items" in payload:
            payload = payload["items"]
        if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
            raise CodexAppServerClientError(
                "Codex app-server 返回了非列表 JSON。",
                code="RUNTIME_PROVIDER_RESPONSE_INVALID",
                details={"path": path},
            )
        return [dict(item) for item in payload]

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        try:
            url = urljoin(self._endpoint, path.lstrip("/"))
            if method == "POST":
                response = self._session.post(
                    url,
                    json=payload or {},
                    timeout=self._timeout_seconds,
                )
            else:
                response = self._session.get(url, timeout=self._timeout_seconds)
            response.raise_for_status()
            response_payload = response.json()
        except CodexAppServerClientError:
            raise
        except Exception as exc:
            raise CodexAppServerClientError(
                "Codex app-server provider 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"path": path},
            ) from exc

        return response_payload
