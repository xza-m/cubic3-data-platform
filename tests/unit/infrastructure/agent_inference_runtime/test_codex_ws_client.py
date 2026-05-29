from __future__ import annotations

import json

import pytest

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_client import (
    CodexAppServerClientError,
    ProviderRunRef,
)
import app.infrastructure.agent_inference_runtime.codex_ws_client as codex_ws_client_module
from app.infrastructure.agent_inference_runtime.codex_ws_client import (
    CodexAppServerWebSocketClient,
)
from app.infrastructure.agent_inference_runtime.codex_ws_protocol import (
    encode_provider_run_id,
)


class _FakeWebSocket:
    def __init__(self, responses: list[dict]):
        self.responses = [json.dumps(item) for item in responses]
        self.sent: list[dict] = []
        self.closed = False

    def send(self, payload: str):
        self.sent.append(json.loads(payload))

    def recv(self) -> str:
        if not self.responses:
            raise TimeoutError("no response")
        return self.responses.pop(0)

    def close(self):
        self.closed = True


def _jsonrpc_result(request_id: int, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _jsonrpc_error(request_id: int) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32000, "message": "provider failed"},
    }


def _jsonrpc_notification(method: str, params: dict) -> dict:
    return {"jsonrpc": "2.0", "method": method, "params": params}


def _client(socket: _FakeWebSocket) -> CodexAppServerWebSocketClient:
    return CodexAppServerWebSocketClient(
        endpoint="ws://127.0.0.1:1455",
        project_root="/repo/cubic3",
        runtime_workspace_roots=["/repo/cubic3", "/repo/shared"],
        socket_factory=lambda endpoint, timeout: socket,
    )


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="session_1",
            thread_id="thread_1",
            turn_id="turn_1",
        ),
        principal_id="alice",
        input={"message": "review"},
        context_pack={"proposal": {"id": "proposal_1"}},
        output_schema="semantic.modeling.review.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_healthcheck_initializes_ws_transport():
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(
                1,
                {
                    "userAgent": "codex-app-server/0.1",
                    "platform": {"os": "darwin"},
                },
            )
        ]
    )

    result = _client(socket).healthcheck()

    assert socket.sent[0]["method"] == "initialize"
    assert result == {
        "status": "ready",
        "transport": "ws",
        "endpoint": "ws://127.0.0.1:1455",
        "user_agent": "codex-app-server/0.1",
        "platform_os": "darwin",
    }


def test_capabilities_describe_ws_protocol_and_supported_surfaces():
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(
                1,
                {
                    "userAgent": "codex-cli/0.133.0",
                    "platform": {"os": "darwin"},
                },
            )
        ]
    )

    capabilities = _client(socket).capabilities()

    assert socket.sent[0]["method"] == "initialize"
    assert capabilities["transport"] == "ws"
    assert capabilities["protocol"] == "codex-app-server-jsonrpc"
    assert capabilities["actions"]
    assert capabilities["artifacts"]
    assert capabilities["events"]


def test_provider_run_ref_keeps_legacy_provider_run_id_only_construction():
    provider_run = ProviderRunRef(provider_run_id="legacy_run_1")

    assert provider_run.provider_run_id == "legacy_run_1"
    assert provider_run.provider == "codex-app-server"
    assert provider_run.provider_thread_id is None


def test_ensure_thread_caches_provider_thread_for_same_runtime_context():
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(2, {"thread": {"id": "provider_thread_1"}}),
        ]
    )
    client = _client(socket)
    ref = _request().runtime_context_ref

    first = client.ensure_thread(ref)
    second = client.ensure_thread(ref)

    assert first == second
    assert [item["method"] for item in socket.sent] == ["initialize", "thread/start"]


def test_submit_run_initializes_thread_and_turn_in_order():
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(2, {"thread": {"id": "provider_thread_1"}}),
            _jsonrpc_result(3, {"turn": {"id": "provider_turn_1"}}),
        ]
    )

    provider_run = _client(socket).submit_run(_request())

    assert isinstance(provider_run, ProviderRunRef)
    assert provider_run.provider == "codex-app-server"
    assert provider_run.provider_thread_id == "provider_thread_1"
    assert provider_run.provider_run_id == encode_provider_run_id(
        "provider_thread_1",
        "provider_turn_1",
    )
    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/start",
        "turn/start",
    ]
    assert socket.sent[1]["params"]["cwd"] == "/repo/cubic3"
    assert socket.sent[2]["params"]["threadId"] == "provider_thread_1"


def test_submit_run_skips_server_notifications_before_matching_responses():
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_notification("thread/started", {"threadId": "provider_thread_1"}),
            _jsonrpc_result(2, {"thread": {"id": "provider_thread_1"}}),
            _jsonrpc_notification("turn/started", {"turnId": "provider_turn_1"}),
            _jsonrpc_result(3, {"turn": {"id": "provider_turn_1"}}),
        ]
    )

    provider_run = _client(socket).submit_run(_request())

    assert provider_run.provider_thread_id == "provider_thread_1"
    assert provider_run.provider_run_id == encode_provider_run_id(
        "provider_thread_1",
        "provider_turn_1",
    )


def test_poll_run_maps_completed_turn_and_extracts_structured_output():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {
                    "turns": [
                        {"id": "other_turn", "status": "inProgress"},
                        {"id": "provider_turn_1", "status": "completed"},
                    ]
                },
            ),
            _jsonrpc_result(
                3,
                {
                    "items": [
                        {"type": "toolCall", "name": "inspect"},
                        {
                            "type": "toolResult",
                            "artifacts": [
                                {
                                    "artifact_id": "artifact_1",
                                    "artifact_type": "json",
                                    "title": "Review result",
                                }
                            ],
                        },
                        {
                            "type": "artifact",
                            "artifact": {
                                "artifact_id": "artifact_2",
                                "artifact_type": "markdown",
                                "title": "Summary",
                            },
                        },
                        {
                            "type": "agentMessage",
                            "text": "{\"decision\":\"approved\",\"score\":0.98}",
                        },
                    ]
                },
            ),
        ]
    )

    result = _client(socket).poll_run(provider_run_id)

    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/list",
        "thread/turns/items/list",
    ]
    assert socket.sent[1]["params"] == {"threadId": "provider_thread_1"}
    assert socket.sent[2]["params"] == {
        "threadId": "provider_thread_1",
        "turnId": "provider_turn_1",
    }
    assert result["status"] == "succeeded"
    assert result["provider_status"] == "completed"
    assert result["structured_output"] == {"decision": "approved", "score": 0.98}
    assert result["artifacts"] == [
        {
            "artifact_id": "artifact_1",
            "artifact_type": "json",
            "title": "Review result",
        },
        {
            "artifact_id": "artifact_2",
            "artifact_type": "markdown",
            "title": "Summary",
        },
    ]


def test_collect_artifacts_returns_cached_artifacts_after_completed_poll():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {"turns": [{"id": "provider_turn_1", "status": "completed"}]},
            ),
            _jsonrpc_result(
                3,
                {
                    "items": [
                        {
                            "type": "agentMessage",
                            "text": "{\"ok\":true}",
                            "artifacts": [
                                {
                                    "artifact_id": "artifact_1",
                                    "artifact_type": "json",
                                    "title": "Cached",
                                }
                            ],
                        }
                    ]
                },
            ),
        ]
    )
    client = _client(socket)

    client.poll_run(provider_run_id)
    artifacts = client.collect_artifacts(provider_run_id)

    assert artifacts == [
        {
            "artifact_id": "artifact_1",
            "artifact_type": "json",
            "title": "Cached",
        }
    ]
    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/list",
        "thread/turns/items/list",
    ]


def test_poll_run_returns_running_without_listing_items():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {"turns": [{"id": "provider_turn_1", "status": "inProgress"}]},
            ),
        ]
    )

    result = _client(socket).poll_run(provider_run_id)

    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/list",
    ]
    assert result["status"] == "running"
    assert result["provider_status"] == "inProgress"
    assert result["structured_output"] == {}


def test_poll_run_maps_failed_turn_and_extracts_error():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {
                    "turns": [
                        {
                            "id": "provider_turn_1",
                            "status": "failed",
                            "error": {"code": "BAD_OUTPUT", "message": "bad output"},
                        }
                    ]
                },
            ),
        ]
    )

    result = _client(socket).poll_run(provider_run_id)

    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/list",
    ]
    assert result["status"] == "failed"
    assert result["structured_output"] == {}
    assert result["error"] == {"code": "BAD_OUTPUT", "message": "bad output"}


def test_stream_events_returns_events_derived_from_items():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {
                    "items": [
                        {"type": "reasoning", "summary": "checked context"},
                        {"type": "agentMessage", "text": "done"},
                    ]
                },
            ),
        ]
    )

    page = _client(socket).stream_events(provider_run_id)

    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/items/list",
    ]
    assert page == {
        "events": [
            {
                "event_type": "reasoning",
                "payload": {"type": "reasoning", "summary": "checked context"},
            },
            {
                "event_type": "agentMessage",
                "payload": {"type": "agentMessage", "text": "done"},
            },
        ],
        "next_cursor": "2",
    }


def test_stream_events_applies_cursor_and_returns_event_count_cursor():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {
                    "items": [
                        {"type": "reasoning", "summary": "first"},
                        {"type": "toolCall", "name": "inspect"},
                        {"type": "agentMessage", "text": "done"},
                    ]
                },
            ),
        ]
    )

    page = _client(socket).stream_events(provider_run_id, cursor="1")

    assert page == {
        "events": [
            {
                "event_type": "toolCall",
                "payload": {"type": "toolCall", "name": "inspect"},
            },
            {
                "event_type": "agentMessage",
                "payload": {"type": "agentMessage", "text": "done"},
            },
        ],
        "next_cursor": "3",
    }


def test_stream_events_refetches_items_until_completed_poll_caches_terminal_events():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {"items": [{"type": "reasoning", "summary": "first"}]},
            ),
            _jsonrpc_result(
                3,
                {
                    "items": [
                        {"type": "reasoning", "summary": "first"},
                        {"type": "agentMessage", "text": "done"},
                    ]
                },
            ),
        ]
    )
    client = _client(socket)

    first_page = client.stream_events(provider_run_id)
    second_page = client.stream_events(provider_run_id, cursor="1")

    assert first_page == {
        "events": [
            {
                "event_type": "reasoning",
                "payload": {"type": "reasoning", "summary": "first"},
            }
        ],
        "next_cursor": "1",
    }
    assert second_page == {
        "events": [
            {
                "event_type": "agentMessage",
                "payload": {"type": "agentMessage", "text": "done"},
            }
        ],
        "next_cursor": "2",
    }
    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/items/list",
        "thread/turns/items/list",
    ]


def test_cached_events_and_artifacts_are_not_mutated_by_return_values():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {"turns": [{"id": "provider_turn_1", "status": "completed"}]},
            ),
            _jsonrpc_result(
                3,
                {
                    "items": [
                        {"type": "reasoning", "summary": "stable"},
                        {
                            "type": "artifact",
                            "artifact": {
                                "artifact_id": "artifact_1",
                                "artifact_type": "json",
                                "title": "Stable",
                            },
                        },
                        {"type": "agentMessage", "text": "{\"ok\":true}"},
                    ]
                },
            ),
        ]
    )
    client = _client(socket)

    poll_result = client.poll_run(provider_run_id)
    event_page = client.stream_events(provider_run_id)
    poll_result["artifacts"][0]["title"] = "Mutated"
    event_page["events"][0]["payload"]["summary"] = "mutated"

    assert client.collect_artifacts(provider_run_id) == [
        {
            "artifact_id": "artifact_1",
            "artifact_type": "json",
            "title": "Stable",
        }
    ]
    assert client.stream_events(provider_run_id)["events"][0]["payload"] == {
        "type": "reasoning",
        "summary": "stable",
    }


def test_cancel_run_interrupts_provider_turn():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(2, {"ok": True}),
        ]
    )

    result = _client(socket).cancel_run(provider_run_id)

    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "turn/interrupt",
    ]
    assert socket.sent[1]["params"] == {
        "threadId": "provider_thread_1",
        "turnId": "provider_turn_1",
    }
    assert result["status"] == "cancelled"


def test_collect_artifacts_fetches_artifacts_when_not_cached():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(
                2,
                {
                    "items": [
                        {
                            "type": "artifact",
                            "artifact": {
                                "artifact_id": "artifact_1",
                                "artifact_type": "json",
                                "title": "Fetched",
                            },
                        },
                        {
                            "type": "artifact",
                            "artifact_id": "artifact_2",
                            "artifact_type": "markdown",
                            "title": "Fetched item",
                        },
                    ]
                },
            ),
        ]
    )

    assert _client(socket).collect_artifacts(provider_run_id) == [
        {
            "artifact_id": "artifact_1",
            "artifact_type": "json",
            "title": "Fetched",
        },
        {
            "artifact_id": "artifact_2",
            "artifact_type": "markdown",
            "title": "Fetched item",
        }
    ]
    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/items/list",
    ]


def test_collect_artifacts_does_not_cache_empty_non_terminal_fetch():
    provider_run_id = encode_provider_run_id("provider_thread_1", "provider_turn_1")
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(1, {"userAgent": "codex", "platform": {"os": "darwin"}}),
            _jsonrpc_result(2, {"items": []}),
            _jsonrpc_result(
                3,
                {
                    "items": [
                        {
                            "type": "artifact",
                            "artifact": {
                                "artifact_id": "artifact_1",
                                "artifact_type": "json",
                                "title": "Later artifact",
                            },
                        }
                    ]
                },
            ),
        ]
    )
    client = _client(socket)

    assert client.collect_artifacts(provider_run_id) == []
    assert client.collect_artifacts(provider_run_id) == [
        {
            "artifact_id": "artifact_1",
            "artifact_type": "json",
            "title": "Later artifact",
        }
    ]
    assert [item["method"] for item in socket.sent] == [
        "initialize",
        "thread/turns/items/list",
        "thread/turns/items/list",
    ]


def test_healthcheck_wraps_jsonrpc_error():
    socket = _FakeWebSocket([_jsonrpc_error(1)])

    with pytest.raises(CodexAppServerClientError) as exc_info:
        _client(socket).healthcheck()

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"


def test_healthcheck_wraps_socket_timeout():
    socket = _FakeWebSocket([])

    with pytest.raises(CodexAppServerClientError) as exc_info:
        _client(socket).healthcheck()

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"


def test_capabilities_wraps_socket_timeout():
    socket = _FakeWebSocket([])

    with pytest.raises(CodexAppServerClientError) as exc_info:
        _client(socket).capabilities()

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"


def test_rejects_non_loopback_endpoint():
    with pytest.raises(CodexAppServerClientError) as exc_info:
        CodexAppServerWebSocketClient(
            endpoint="ws://example.com:1455",
            project_root="/repo/cubic3",
            runtime_workspace_roots=["/repo/cubic3"],
            socket_factory=lambda endpoint, timeout: _FakeWebSocket([]),
        )

    assert exc_info.value.code == "RUNTIME_CODEX_ENDPOINT_INVALID"
    assert exc_info.value.status_code == 400


def test_allows_positional_endpoint_project_root_and_workspace_roots():
    socket = _FakeWebSocket(
        [
            _jsonrpc_result(
                1,
                {
                    "userAgent": "codex-app-server/0.1",
                    "platform": {"os": "darwin"},
                },
            )
        ]
    )

    client = CodexAppServerWebSocketClient(
        "ws://127.0.0.1:8799",
        "/repo/cubic3",
        ["/repo/cubic3"],
        socket_factory=lambda endpoint, timeout: socket,
    )

    assert client.healthcheck()["status"] == "ready"


def test_rejects_hostname_that_only_starts_with_127():
    with pytest.raises(CodexAppServerClientError) as exc_info:
        CodexAppServerWebSocketClient(
            endpoint="ws://127.example.com:8799",
            project_root="/repo/cubic3",
            runtime_workspace_roots=["/repo/cubic3"],
            socket_factory=lambda endpoint, timeout: _FakeWebSocket([]),
        )

    assert exc_info.value.code == "RUNTIME_CODEX_ENDPOINT_INVALID"
    assert exc_info.value.status_code == 400


def test_rejects_zero_port_endpoint():
    with pytest.raises(CodexAppServerClientError) as exc_info:
        CodexAppServerWebSocketClient(
            endpoint="ws://127.0.0.1:0",
            project_root="/repo/cubic3",
            runtime_workspace_roots=["/repo/cubic3"],
            socket_factory=lambda endpoint, timeout: _FakeWebSocket([]),
        )

    assert exc_info.value.code == "RUNTIME_CODEX_ENDPOINT_INVALID"
    assert exc_info.value.status_code == 400


def test_default_socket_factory_suppresses_browser_origin(monkeypatch):
    captured = {}
    socket = object()

    def fake_create_connection(endpoint, **kwargs):
        captured["endpoint"] = endpoint
        captured.update(kwargs)
        return socket

    monkeypatch.setattr(codex_ws_client_module, "create_connection", fake_create_connection)

    result = codex_ws_client_module._default_socket_factory("ws://127.0.0.1:8799", 5)

    assert result is socket
    assert captured == {
        "endpoint": "ws://127.0.0.1:8799",
        "timeout": 5,
        "suppress_origin": True,
    }
