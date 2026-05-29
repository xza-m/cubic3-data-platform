"""Codex app-server transport client 协议定义。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Protocol

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
)


@dataclass(frozen=True)
class ProviderThreadRef:
    provider_thread_id: str


@dataclass(frozen=True)
class ProviderRunRef:
    provider_run_id: str
    provider: str = "codex-app-server"
    provider_thread_id: str | None = None


class CodexAppServerClientError(RuntimeError):
    """Codex app-server transport 调用失败。"""

    def __init__(
        self,
        message: str,
        *,
        code: str = "RUNTIME_PROVIDER_ERROR",
        details: Dict[str, Any] | None = None,
        status_code: int = 502,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}
        self.status_code = status_code


class CodexAppServerClient(Protocol):
    def healthcheck(self) -> Dict[str, Any]:
        ...

    def capabilities(self) -> Dict[str, Any]:
        ...

    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef:
        ...

    def submit_run(self, request: AgentInferenceRuntimeRequest) -> ProviderRunRef:
        ...

    def poll_run(self, provider_run_id: str) -> Dict[str, Any]:
        ...

    def stream_events(
        self,
        provider_run_id: str,
        *,
        cursor: str | None = None,
    ) -> Dict[str, Any]:
        ...

    def cancel_run(self, provider_run_id: str) -> Dict[str, Any]:
        ...

    def collect_artifacts(self, provider_run_id: str) -> List[Dict[str, Any]]:
        ...


class UnavailableCodexAppServerClient:
    """WS client 尚未接入时使用的显式失败实现。"""

    def __init__(
        self,
        *,
        reason: str = "Codex app-server WebSocket client 尚未接入。",
    ) -> None:
        self._reason = reason

    def healthcheck(self) -> Dict[str, Any]:
        raise self._error()

    def capabilities(self) -> Dict[str, Any]:
        raise self._error()

    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef:
        raise self._error()

    def submit_run(self, request: Any) -> Dict[str, Any]:
        raise self._error()

    def poll_run(self, provider_run_id: str) -> Dict[str, Any]:
        raise self._error()

    def stream_events(
        self,
        provider_run_id: str,
        *,
        cursor: str | None = None,
    ) -> Dict[str, Any]:
        raise self._error()

    def cancel_run(self, provider_run_id: str) -> Dict[str, Any]:
        raise self._error()

    def collect_artifacts(self, provider_run_id: str) -> List[Dict[str, Any]]:
        raise self._error()

    def _error(self) -> CodexAppServerClientError:
        return CodexAppServerClientError(
            self._reason,
            code="RUNTIME_PROVIDER_NOT_IMPLEMENTED",
            details={"transport": "ws"},
            status_code=501,
        )
