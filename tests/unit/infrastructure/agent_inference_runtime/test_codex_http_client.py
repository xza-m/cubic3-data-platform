from __future__ import annotations

import pytest

from app.infrastructure.agent_inference_runtime.codex_http_client import (
    CodexAppServerClientError,
    CodexAppServerHttpClient,
)


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class _Session:
    def __init__(self):
        self.calls = []

    def get(self, url, timeout):
        self.calls.append(("GET", url, timeout))
        if url.endswith("/health"):
            return _Response({"status": "ok", "version": "0.1.0"})
        if url.endswith("/capabilities"):
            return _Response({"tools": ["read_file"], "max_context_tokens": 200000})
        raise AssertionError(url)


def test_health_and_capabilities_use_configured_endpoint():
    session = _Session()
    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=session,
        timeout_seconds=3,
    )

    assert client.healthcheck()["status"] == "ok"
    assert client.capabilities()["tools"] == ["read_file"]
    assert session.calls == [
        ("GET", "http://127.0.0.1:8765/health", 3),
        ("GET", "http://127.0.0.1:8765/capabilities", 3),
    ]


def test_non_object_json_response_raises_provider_error():
    class _BadSession:
        def get(self, url, timeout):
            return _Response(["not", "an", "object"])

    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=_BadSession(),
        timeout_seconds=3,
    )

    with pytest.raises(CodexAppServerClientError) as exc_info:
        client.healthcheck()

    assert exc_info.value.code == "RUNTIME_PROVIDER_RESPONSE_INVALID"
    assert exc_info.value.status_code == 502
    assert exc_info.value.details["path"] == "/health"


def test_http_failure_raises_provider_error_without_leaking_transport_exception():
    class _FailingSession:
        def get(self, url, timeout):
            return _Response({"error": "down"}, status_code=503)

    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=_FailingSession(),
        timeout_seconds=3,
    )

    with pytest.raises(CodexAppServerClientError) as exc_info:
        client.healthcheck()

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"
    assert exc_info.value.status_code == 502
    assert exc_info.value.details == {"path": "/health"}
