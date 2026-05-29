from __future__ import annotations

import os

import pytest

from app.infrastructure.agent_inference_runtime.codex_http_client import CodexAppServerHttpClient


@pytest.mark.skipif(
    os.getenv("AGENT_CODEX_LIVE") != "1",
    reason="set AGENT_CODEX_LIVE=1 to run live Codex smoke",
)
def test_codex_live_smoke_checks_health_and_capabilities():
    endpoint = os.getenv("AGENT_CODEX_ENDPOINT")
    unix_socket = os.getenv("AGENT_CODEX_UNIX_SOCKET")
    assert endpoint or unix_socket, "AGENT_CODEX_ENDPOINT or AGENT_CODEX_UNIX_SOCKET is required for live Codex smoke"
    if not endpoint:
        pytest.skip("Codex HTTP live smoke requires AGENT_CODEX_ENDPOINT; Unix socket config is covered by adapter tests")

    timeout_seconds = float(os.getenv("AGENT_CODEX_TIMEOUT_SECONDS", "10"))
    client = CodexAppServerHttpClient(endpoint=endpoint, timeout_seconds=timeout_seconds)

    health = client.healthcheck()
    capabilities = client.capabilities()

    assert str(health.get("status", "")).lower() in {"ok", "ready", "healthy"}
    assert any(key in capabilities for key in ("tools", "actions", "artifacts", "protocol_version"))
