from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


REQUIRED_CLIENT_METHODS = [
    "initialize",
    "thread/start",
    "turn/start",
    "thread/turns/list",
    "thread/turns/items/list",
    "turn/interrupt",
    "model/list",
    "permissionProfile/list",
]
REQUIRED_SERVER_NOTIFICATIONS = [
    "thread/started",
    "turn/started",
    "turn/completed",
    "item/completed",
    "item/agentMessage/delta",
]
TURN_STATUS_MAP = {
    "completed": "succeeded",
    "inProgress": "running",
    "failed": "failed",
    "interrupted": "cancelled",
}


def main() -> None:
    out = Path("tests/fixtures/agent_inference_runtime/codex_app_server_protocol_snapshot.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    help_text = subprocess.check_output(
        ["codex", "app-server", "--help"],
        text=True,
    )
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        subprocess.check_call(
            ["codex", "app-server", "generate-json-schema", "--experimental", "--out", str(tmp_path)]
        )
        client_request = json.loads((tmp_path / "ClientRequest.json").read_text(encoding="utf-8"))
        server_notification = json.loads((tmp_path / "ServerNotification.json").read_text(encoding="utf-8"))
    methods = sorted(
        item["properties"]["method"]["enum"][0]
        for item in client_request["oneOf"]
        if item.get("properties", {}).get("method", {}).get("enum")
    )
    notifications = sorted(
        item["properties"]["method"]["enum"][0]
        for item in server_notification["oneOf"]
        if item.get("properties", {}).get("method", {}).get("enum")
    )
    snapshot = {
        "generated_by": "codex app-server generate-json-schema --experimental",
        "listen_transports": ["stdio://", "unix://", "unix://PATH", "ws://IP:PORT", "off"],
        "help_mentions_ws_auth": "--ws-auth" in help_text,
        "required_client_methods": REQUIRED_CLIENT_METHODS,
        "required_server_notifications": REQUIRED_SERVER_NOTIFICATIONS,
        "turn_status_map": TURN_STATUS_MAP,
        "all_client_methods": methods,
        "all_server_notifications": notifications,
    }
    for method in REQUIRED_CLIENT_METHODS:
        if method not in methods:
            raise SystemExit(f"missing client method: {method}")
    for method in REQUIRED_SERVER_NOTIFICATIONS:
        if method not in notifications:
            raise SystemExit(f"missing server notification: {method}")
    out.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
