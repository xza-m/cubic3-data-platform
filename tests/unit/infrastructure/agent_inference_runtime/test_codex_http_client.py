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
        if url.endswith("/runs/codex_run_1"):
            return _Response({"provider_run_id": "codex_run_1", "status": "running"})
        if url.endswith("/runs/codex_run_1/events"):
            return _Response({"items": [{"event_type": "run.started", "seq": 1}]})
        if url.endswith("/runs/codex_run_1/artifacts"):
            return _Response({"items": [{"artifact_id": "artifact_1"}]})
        if url.endswith("/runs/codex%2Frun%2F1"):
            return _Response({"provider_run_id": "codex/run/1", "status": "running"})
        if url.endswith("/runs/..%2Fcapabilities"):
            return _Response({"provider_run_id": "../capabilities", "status": "running"})
        raise AssertionError(url)

    def post(self, url, json, timeout):
        self.calls.append(("POST", url, json, timeout))
        if url.endswith("/runs"):
            return _Response({"provider_run_id": "codex_run_1", "status": "queued"})
        if url.endswith("/runs/codex_run_1/cancel"):
            return _Response({"provider_run_id": "codex_run_1", "status": "cancelled"})
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


def test_run_lifecycle_transport_methods_validate_object_and_list_payloads():
    session = _Session()
    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=session,
        timeout_seconds=3,
    )

    assert client.submit_run({"action": "semantic.modeling.review_proposal"}) == {
        "provider_run_id": "codex_run_1",
        "status": "queued",
    }
    assert client.poll_run("codex_run_1") == {
        "provider_run_id": "codex_run_1",
        "status": "running",
    }
    assert client.cancel_run("codex_run_1")["status"] == "cancelled"
    assert client.events("codex_run_1") == [{"event_type": "run.started", "seq": 1}]
    assert client.artifacts("codex_run_1") == [{"artifact_id": "artifact_1"}]
    assert session.calls == [
        ("POST", "http://127.0.0.1:8765/runs", {"action": "semantic.modeling.review_proposal"}, 3),
        ("GET", "http://127.0.0.1:8765/runs/codex_run_1", 3),
        ("POST", "http://127.0.0.1:8765/runs/codex_run_1/cancel", {}, 3),
        ("GET", "http://127.0.0.1:8765/runs/codex_run_1/events", 3),
        ("GET", "http://127.0.0.1:8765/runs/codex_run_1/artifacts", 3),
    ]


def test_run_lifecycle_list_payloads_must_be_items_objects():
    class _BadEventsSession(_Session):
        def get(self, url, timeout):
            if url.endswith("/runs/codex_run_1/events"):
                return _Response({"items": ["bad"]})
            return super().get(url, timeout)

    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=_BadEventsSession(),
        timeout_seconds=3,
    )

    with pytest.raises(CodexAppServerClientError) as exc_info:
        client.events("codex_run_1")

    assert exc_info.value.code == "RUNTIME_PROVIDER_RESPONSE_INVALID"
    assert exc_info.value.details["path"] == "/runs/codex_run_1/events"


def test_run_lifecycle_url_encodes_provider_run_id_path_segments():
    session = _Session()
    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=session,
        timeout_seconds=3,
    )

    assert client.poll_run("codex/run/1")["provider_run_id"] == "codex/run/1"
    assert client.poll_run("../capabilities")["provider_run_id"] == "../capabilities"
    assert session.calls == [
        ("GET", "http://127.0.0.1:8765/runs/codex%2Frun%2F1", 3),
        ("GET", "http://127.0.0.1:8765/runs/..%2Fcapabilities", 3),
    ]


def test_run_lifecycle_rejects_blank_provider_run_id():
    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=_Session(),
        timeout_seconds=3,
    )

    with pytest.raises(CodexAppServerClientError) as exc_info:
        client.poll_run("   ")

    assert exc_info.value.code == "RUNTIME_PROVIDER_RUN_ID_INVALID"
    assert exc_info.value.status_code == 400


def test_run_lifecycle_accepts_endpoint_specific_collection_wrappers():
    class _WrappedSession(_Session):
        def get(self, url, timeout):
            self.calls.append(("GET", url, timeout))
            if url.endswith("/runs/codex_run_1/events"):
                return _Response({"events": [{"event_type": "run.succeeded"}]})
            if url.endswith("/runs/codex_run_1/artifacts"):
                return _Response({"artifacts": [{"artifact_id": "artifact_2"}]})
            raise AssertionError(url)

    client = CodexAppServerHttpClient(
        endpoint="http://127.0.0.1:8765",
        session=_WrappedSession(),
        timeout_seconds=3,
    )

    assert client.events("codex_run_1") == [{"event_type": "run.succeeded"}]
    assert client.artifacts("codex_run_1") == [{"artifact_id": "artifact_2"}]


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
