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
