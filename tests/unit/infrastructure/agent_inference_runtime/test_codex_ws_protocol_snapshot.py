from __future__ import annotations

import json
from pathlib import Path


SNAPSHOT = Path("tests/fixtures/agent_inference_runtime/codex_app_server_protocol_snapshot.json")


def test_codex_app_server_protocol_snapshot_contains_ws_runtime_methods():
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))

    assert data["listen_transports"] == ["stdio://", "unix://", "unix://PATH", "ws://IP:PORT", "off"]
    assert data["required_client_methods"] == [
        "initialize",
        "thread/start",
        "turn/start",
        "thread/turns/list",
        "thread/turns/items/list",
        "turn/interrupt",
        "model/list",
        "permissionProfile/list",
    ]
    assert "turn/completed" in data["required_server_notifications"]
    assert data["turn_status_map"]["completed"] == "succeeded"
    assert data["turn_status_map"]["inProgress"] == "running"
