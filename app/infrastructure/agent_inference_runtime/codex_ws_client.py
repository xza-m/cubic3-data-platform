"""Codex app-server WebSocket transport client。"""
from __future__ import annotations

from copy import deepcopy
import json
from typing import Any, Callable
from urllib.parse import urlparse

from websocket import create_connection

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.codex_client import (
    CodexAppServerClientError,
    ProviderRunRef,
    ProviderThreadRef,
)
from app.infrastructure.agent_inference_runtime.codex_ws_protocol import (
    CodexJsonRpcCodec,
    CodexWsProtocolError,
    build_initialize_params,
    build_thread_start_params,
    build_turn_start_params,
    decode_provider_run_id,
    encode_provider_run_id,
    map_turn_status,
)

SocketFactory = Callable[[str, int], Any]


class CodexAppServerWebSocketClient:
    """面向本机 Codex app-server 的最小同步 WebSocket client。"""

    def __init__(
        self,
        endpoint: str,
        project_root: str,
        runtime_workspace_roots: list[str],
        timeout_seconds: int = 30,
        socket_factory: SocketFactory | None = None,
    ) -> None:
        self._validate_endpoint(endpoint)
        self._endpoint = endpoint
        self._project_root = project_root
        self._runtime_workspace_roots = list(runtime_workspace_roots)
        self._timeout_seconds = timeout_seconds
        self._socket_factory = socket_factory or _default_socket_factory
        self._socket: Any | None = None
        self._codec = CodexJsonRpcCodec()
        self._initialized = False
        self._initialize_result: dict[str, Any] = {}
        self._thread_cache: dict[tuple[str, str, str], ProviderThreadRef] = {}
        self._events_cache: dict[str, list[dict[str, Any]]] = {}
        self._artifacts_cache: dict[str, list[dict[str, Any]]] = {}

    def healthcheck(self) -> dict[str, Any]:
        result = self._initialize()
        platform = result.get("platform") if isinstance(result.get("platform"), dict) else {}
        return {
            "status": "ready",
            "transport": "ws",
            "endpoint": self._endpoint,
            "user_agent": result.get("userAgent"),
            "platform_os": platform.get("os"),
        }

    def capabilities(self) -> dict[str, Any]:
        self._initialize()
        return {
            "transport": "ws",
            "protocol": "codex-app-server-jsonrpc",
            "actions": ["semantic.modeling.review_proposal", "semantic.modeling.chat"],
            "artifacts": ["workspace_file"],
            "events": ["reasoning", "toolCall", "agentMessage"],
        }

    def close(self) -> None:
        if self._socket is None:
            return
        close = getattr(self._socket, "close", None)
        if callable(close):
            close()
        self._socket = None

    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef:
        cache_key = (ref.project_id, ref.session_id, ref.thread_id)
        cached = self._thread_cache.get(cache_key)
        if cached is not None:
            return cached

        params = build_thread_start_params(
            ref,
            project_root=self._project_root,
            runtime_workspace_roots=self._runtime_workspace_roots,
        )
        result = self._request("thread/start", params)
        provider_thread_id = _nested_id(result, "thread")
        provider_ref = ProviderThreadRef(provider_thread_id=provider_thread_id)
        self._thread_cache[cache_key] = provider_ref
        return provider_ref

    def submit_run(self, request: AgentInferenceRuntimeRequest) -> ProviderRunRef:
        thread = self.ensure_thread(request.runtime_context_ref)
        result = self._request(
            "turn/start",
            build_turn_start_params(request, provider_thread_id=thread.provider_thread_id),
        )
        provider_turn_id = _nested_id(result, "turn")
        return ProviderRunRef(
            provider_run_id=encode_provider_run_id(
                thread.provider_thread_id,
                provider_turn_id,
            ),
            provider="codex-app-server",
            provider_thread_id=thread.provider_thread_id,
        )

    def poll_run(self, provider_run_id: str) -> dict[str, Any]:
        provider_thread_id, provider_turn_id = self._decode_provider_run_id(provider_run_id)
        result = self._request("thread/turns/list", {"threadId": provider_thread_id})
        turn = _find_turn(result.get("turns"), provider_turn_id)
        provider_status = str(turn.get("status", "failed"))
        status = map_turn_status(provider_status)
        items: list[dict[str, Any]] = []
        structured_output: dict[str, Any] = {}

        artifacts: list[dict[str, Any]] = []
        if status == "succeeded":
            items = self._list_items(provider_thread_id, provider_turn_id)
            self._events_cache[provider_run_id] = _copy_dict_list(_events_from_items(items))
            artifacts = _artifacts_from_items(items)
            self._artifacts_cache[provider_run_id] = _copy_dict_list(artifacts)
            structured_output = _structured_output_from_items(items)

        return {
            "provider_run_id": provider_run_id,
            "provider_thread_id": provider_thread_id,
            "provider_turn_id": provider_turn_id,
            "status": status,
            "provider_status": provider_status,
            "structured_output": dict(structured_output),
            "artifacts": _copy_dict_list(artifacts),
            "usage": {},
            "error": _error_from_turn(turn) if status == "failed" else None,
        }

    def stream_events(
        self,
        provider_run_id: str,
        *,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        events = self._events_cache.get(provider_run_id)
        if events is None:
            provider_thread_id, provider_turn_id = self._decode_provider_run_id(provider_run_id)
            events = _events_from_items(self._list_items(provider_thread_id, provider_turn_id))

        start = _cursor_offset(cursor)
        return {
            "events": _copy_dict_list(events[start:]),
            "next_cursor": str(len(events)),
        }

    def cancel_run(self, provider_run_id: str) -> dict[str, Any]:
        provider_thread_id, provider_turn_id = self._decode_provider_run_id(provider_run_id)
        self._request(
            "turn/interrupt",
            {
                "threadId": provider_thread_id,
                "turnId": provider_turn_id,
            },
        )
        return {
            "provider_run_id": provider_run_id,
            "status": "cancelled",
        }

    def collect_artifacts(self, provider_run_id: str) -> list[dict[str, Any]]:
        cached = self._artifacts_cache.get(provider_run_id)
        if cached is not None:
            return _copy_dict_list(cached)

        provider_thread_id, provider_turn_id = self._decode_provider_run_id(provider_run_id)
        artifacts = _artifacts_from_items(self._list_items(provider_thread_id, provider_turn_id))
        return _copy_dict_list(artifacts)

    def _list_items(self, provider_thread_id: str, provider_turn_id: str) -> list[dict[str, Any]]:
        result = self._request(
            "thread/turns/items/list",
            {
                "threadId": provider_thread_id,
                "turnId": provider_turn_id,
            },
        )
        return _items_from_result(result)

    def _initialize(self) -> dict[str, Any]:
        if self._initialized:
            return self._initialize_result
        result = self._raw_request("initialize", build_initialize_params())
        self._initialized = True
        self._initialize_result = result
        return result

    def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._initialize()
        return self._raw_request(method, params)

    def _raw_request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            payload = self._codec.request(method, params)
            expected_id = int(payload["id"])
            socket = self._connect()
            socket.send(json.dumps(payload, ensure_ascii=False))
            while True:
                response = self._codec.parse_response(socket.recv(), expected_id=expected_id)
                if response is not None:
                    return response
        except CodexAppServerClientError:
            raise
        except CodexWsProtocolError as exc:
            raise CodexAppServerClientError(
                "Codex app-server WebSocket 协议调用失败。",
                code=exc.code,
                details=exc.details,
            ) from exc
        except Exception as exc:
            raise CodexAppServerClientError(
                "Codex app-server WebSocket 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"error": str(exc), "method": method},
            ) from exc

    def _connect(self) -> Any:
        if self._socket is None:
            self._socket = self._socket_factory(self._endpoint, self._timeout_seconds)
        return self._socket

    def _decode_provider_run_id(self, provider_run_id: str) -> tuple[str, str]:
        try:
            return decode_provider_run_id(provider_run_id)
        except Exception as exc:
            raise CodexAppServerClientError(
                "Codex app-server provider_run_id 无法解析。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"provider_run_id": provider_run_id},
            ) from exc

    @staticmethod
    def _validate_endpoint(endpoint: str) -> None:
        parsed = urlparse(endpoint)
        hostname = parsed.hostname
        try:
            port = parsed.port
        except ValueError:
            port = None
        if parsed.scheme != "ws" or port is None or port <= 0 or not _is_loopback(hostname):
            raise CodexAppServerClientError(
                "Codex app-server endpoint 必须是带端口的本机 ws:// 地址。",
                code="RUNTIME_CODEX_ENDPOINT_INVALID",
                details={"endpoint": endpoint},
                status_code=400,
            )


def _default_socket_factory(endpoint: str, timeout_seconds: int) -> Any:
    return create_connection(endpoint, timeout=timeout_seconds, suppress_origin=True)


def _is_loopback(hostname: str | None) -> bool:
    if hostname is None:
        return False
    return hostname in {"127.0.0.1", "localhost", "::1"}


def _nested_id(result: dict[str, Any], key: str) -> str:
    value = result.get(key)
    if isinstance(value, dict) and isinstance(value.get("id"), str) and value["id"]:
        return value["id"]
    raise CodexAppServerClientError(
        "Codex app-server response 缺少 provider id。",
        code="RUNTIME_PROVIDER_ERROR",
        details={"key": key, "response": result},
    )


def _find_turn(raw_turns: Any, provider_turn_id: str) -> dict[str, Any]:
    if isinstance(raw_turns, list):
        for turn in raw_turns:
            if isinstance(turn, dict) and turn.get("id") == provider_turn_id:
                return dict(turn)
    raise CodexAppServerClientError(
        "Codex app-server response 未找到目标 turn。",
        code="RUNTIME_PROVIDER_ERROR",
        details={"provider_turn_id": provider_turn_id, "turns": raw_turns},
    )


def _events_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "event_type": str(item.get("type", "unknown")),
            "payload": deepcopy(item),
        }
        for item in items
    ]


def _artifacts_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    for item in items:
        raw_artifacts = item.get("artifacts")
        if isinstance(raw_artifacts, list):
            artifacts.extend(deepcopy(artifact) for artifact in raw_artifacts if isinstance(artifact, dict))

        raw_artifact = item.get("artifact")
        if isinstance(raw_artifact, dict):
            artifacts.append(deepcopy(raw_artifact))
        elif item.get("type") == "artifact":
            artifact = {
                key: value
                for key, value in item.items()
                if key not in {"type", "artifact", "artifacts"}
            }
            if artifact:
                artifacts.append(deepcopy(artifact))
    return artifacts


def _copy_dict_list(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [deepcopy(item) for item in items]


def _structured_output_from_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    text = _latest_agent_message_text(items)
    if text is None:
        return {}
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return {"message": text}
    if isinstance(payload, dict):
        return dict(payload)
    return {"message": text}


def _latest_agent_message_text(items: list[dict[str, Any]]) -> str | None:
    for item in reversed(items):
        if item.get("type") == "agentMessage" and isinstance(item.get("text"), str):
            return item["text"]
    return None


def _error_from_turn(turn: dict[str, Any]) -> dict[str, Any] | None:
    error = turn.get("error")
    if isinstance(error, dict):
        return dict(error)
    if error:
        return {"code": "RUNTIME_PROVIDER_ERROR", "message": str(error)}
    return None


def _cursor_offset(cursor: str | None) -> int:
    if cursor is None:
        return 0
    try:
        return max(0, int(cursor))
    except ValueError:
        return 0


def _items_from_result(result: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = result.get("items", [])
    if isinstance(raw_items, list):
        return [dict(item) for item in raw_items if isinstance(item, dict)]
    return []
