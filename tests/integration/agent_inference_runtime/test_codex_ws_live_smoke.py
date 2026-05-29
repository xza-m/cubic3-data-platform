from __future__ import annotations

import os
from urllib.parse import urlparse

import pytest

from app.infrastructure.agent_inference_runtime.codex_ws_client import (
    CodexAppServerWebSocketClient,
)


pytestmark = pytest.mark.skipif(
    os.getenv("AGENT_CODEX_LIVE") != "1" or os.getenv("AGENT_CODEX_TRANSPORT") != "ws",
    reason="set AGENT_CODEX_LIVE=1 and AGENT_CODEX_TRANSPORT=ws to run Codex WS live smoke",
)


def test_codex_ws_live_smoke_initializes_and_reports_capabilities():
    endpoint = os.getenv("AGENT_CODEX_ENDPOINT", "").strip()
    project_root = os.getenv("AGENT_CODEX_PROJECT_ROOT", os.getcwd())
    timeout = _positive_int(os.getenv("AGENT_CODEX_TIMEOUT_SECONDS"), default=10)
    assert _is_loopback_ws(endpoint)

    client = CodexAppServerWebSocketClient(
        endpoint=endpoint,
        project_root=project_root,
        runtime_workspace_roots=[project_root],
        timeout_seconds=timeout,
    )
    try:
        health = client.healthcheck()
        capabilities = client.capabilities()
    finally:
        client.close()

    assert health["status"] == "ready"
    assert health["transport"] == "ws"
    assert capabilities["protocol"] == "codex-app-server-jsonrpc"


def _is_loopback_ws(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    try:
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "ws"
        and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
        and port is not None
        and port > 0
    )


def _positive_int(value: str | None, *, default: int) -> int:
    try:
        parsed = int(value or "")
    except ValueError:
        return default
    return parsed if parsed > 0 else default
