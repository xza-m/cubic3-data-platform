from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Callable
from urllib.parse import quote, urljoin

import requests


class Cubic3DpError(Exception):
    """CLI 可展示错误。"""

    def __init__(self, message: str, *, exit_code: int = 1):
        super().__init__(message)
        self.exit_code = exit_code


class ApiError(Cubic3DpError):
    """服务端 API 返回非成功状态。"""


@dataclass(frozen=True)
class ClientConfig:
    base_url: str
    access_token: str | None = None
    api_key: str | None = None
    timeout: float = 30.0


class Cubic3DpClient:
    def __init__(
        self,
        config: ClientConfig,
        *,
        session: requests.Session | None = None,
        refresh_handler: Callable[[], str | None] | None = None,
    ):
        self._config = config
        self._session = session or requests.Session()
        self._refresh_handler = refresh_handler

    def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, *, json_body: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, json_body=json_body)

    def call(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> tuple[Any, int]:
        """返回 (完整响应 payload, http_status)，不拆 envelope、不因 code!=0 抛错。

        供需要原样透传 `{code,message,data,trace_id}` envelope 的命令使用（与 semctl 输出契约对齐）；
        401 仍走刷新重试。网络错误抛 ApiError。
        """
        url = _join_url(self._config.base_url, path)
        response = self._send(method, url, params=params, json_body=json_body)
        if response.status_code == 401 and self._refresh_handler:
            refreshed = self._refresh_handler()
            if refreshed:
                self._config = replace(self._config, access_token=refreshed)
                response = self._send(method, url, params=params, json_body=json_body)
        return _json_payload(response), response.status_code

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        url = _join_url(self._config.base_url, path)
        response = self._send(method, url, params=params, json_body=json_body)

        payload = _json_payload(response)
        if response.status_code == 401 and self._refresh_handler:
            refreshed_access_token = self._refresh_handler()
            if refreshed_access_token:
                self._config = replace(self._config, access_token=refreshed_access_token)
                response = self._send(method, url, params=params, json_body=json_body)
                payload = _json_payload(response)
        if response.status_code >= 400:
            message = _error_message(payload) or f"HTTP {response.status_code}"
            raise ApiError(message)
        if isinstance(payload, dict) and payload.get("code") not in (None, 0):
            raise ApiError(_error_message(payload) or "API 返回失败")
        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]
        return payload

    def _send(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> requests.Response:
        try:
            return self._session.request(
                method,
                url,
                params=_compact(params),
                json=json_body,
                headers=self._headers(),
                timeout=self._config.timeout,
            )
        except requests.RequestException as exc:
            raise ApiError(f"请求失败: {exc}") from exc

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self._config.access_token:
            headers["Authorization"] = f"Bearer {self._config.access_token}"
        if self._config.api_key:
            headers["X-C3-Api-Key"] = self._config.api_key
        headers["X-C3-Client-Type"] = "cli"
        return headers


def encode_segment(value: str) -> str:
    return quote(value, safe="")


def _join_url(base_url: str, path: str) -> str:
    normalized_base = base_url.rstrip("/") + "/"
    normalized_path = path.lstrip("/")
    return urljoin(normalized_base, normalized_path)


def _compact(params: dict[str, Any] | None) -> dict[str, Any] | None:
    if not params:
        return None
    return {key: value for key, value in params.items() if value is not None and value != ""}


def _json_payload(response: requests.Response) -> Any:
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise ApiError(f"服务端未返回 JSON: HTTP {response.status_code}") from exc


def _error_message(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    details = payload.get("details")
    suffix = ""
    if isinstance(details, dict):
        code = details.get("code") or details.get("error_code")
        suffix = f" ({code})" if code else ""
    code = payload.get("error_code") or payload.get("error")
    if code and not suffix and isinstance(code, str):
        suffix = f" ({code})"
    return str(payload.get("message") or payload.get("error") or "").strip() + suffix
