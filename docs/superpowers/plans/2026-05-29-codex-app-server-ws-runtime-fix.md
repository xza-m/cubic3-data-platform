# Codex App Server WS Runtime Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将平台级 Codex runtime 收敛为真实本机 `codex app-server --listen ws://127.0.0.1:<port>` WebSocket 主链路，使建模 Copilot 的 review / repair / audit 能通过真实 Codex app-server 执行、追踪和验收。

**Architecture:** 继续采用平台内 `AgentInferenceRuntimeService` + `CodexRunService` + `CodexAppServerClient` protocol，不新建独立网关项目。Codex app-server 只通过 loopback WebSocket 接入；HTTP REST skeleton 已删除，不再作为兼容分支、测试模式或验收依据。协议实现先由本机 `codex app-server generate-json-schema/generate-ts` 生成证据快照，再实现 JSON-RPC codec、WS client、process manager、管理 API 和 live smoke。

**Tech Stack:** Python 3.13、Flask、pytest、dependency-injector、`websocket-client==1.8.0`、Codex CLI `codex app-server --listen ws://...`、React 18、Vitest、Playwright。

---

## 0. Current Baseline

- `AGENT_CODEX_TRANSPORT` 默认值已经改为 `ws`。
- 旧 REST-shaped client、旧 unit test、旧 non-WS live smoke 已删除。
- 当前 DI 注入 `UnavailableCodexAppServerClient`，Codex run submission 会显式返回 `RUNTIME_PROVIDER_NOT_IMPLEMENTED`。
- `make test-platform-agent-runtime` 覆盖平台 runtime、Codex workspace/process contract、数据资产 consumer、语义建模 consumer、管理 API。
- `codex app-server --help` 本机证据显示 `--listen` 支持 `stdio://`、`unix://`、`unix://PATH`、`ws://IP:PORT`、`off`，并支持 `generate-ts` / `generate-json-schema`。
- 真实 WS client 未实现；`CodexProcessManager` 仍需从旧 `codex-app-server --socket` 命令切到 `codex app-server --listen ws://...`。

## 1. Product and Architecture Decisions

### 1.1 Runtime 分工

| Runtime | 用途 | 用户是否选择 | 当前主线 |
|---|---|---|---|
| OpenAI-compatible / LLM API | 低延迟候选生成、字段语义候选、普通 Copilot 对话 | 普通用户不选择 | 已接入 |
| Codex app-server WS | 长上下文 review、repair、audit、工作区 artifact、文件/命令类证据 | 普通用户不选择；平台设置页只做状态与受控启动 | 本计划实现 |

### 1.2 Codex app-server 不是 command provider

普通 command provider 是一次命令执行；Codex app-server 是长驻 agent 工作区会话。平台需要管理 `project / session / thread / turn / run / artifact`，而不是等待一个子进程 stdout。

### 1.3 WS-only 口径

- HTTP REST 不属于 Codex app-server 集成模式。
- 本计划只实现 `ws://127.0.0.1:<port>` 主链路。
- `unix://` 和 `stdio://` 只保留为 Codex CLI 原生 listen 形态的架构说明，不在本计划实现。
- 非 loopback WS 需要 capability token 或 signed bearer token；本计划先 fail-closed，仅允许 loopback。

## 2. File Structure

Create:

- `scripts/agent_runtime/generate_codex_app_server_protocol_snapshot.py`
  生成最小协议证据快照，避免手写猜测协议方法。
- `tests/fixtures/agent_inference_runtime/codex_app_server_protocol_snapshot.json`
  存储本计划依赖的最小 methods / notification / type shape 快照。
- `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol_snapshot.py`
  验证快照包含必需方法。
- `app/infrastructure/agent_inference_runtime/codex_ws_protocol.py`
  JSON-RPC codec、方法常量、参数构造、provider id 编解码、状态映射。
- `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py`
- `app/infrastructure/agent_inference_runtime/codex_ws_client.py`
  真实 WebSocket transport，实现 `CodexAppServerClient` protocol。
- `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_client.py`
- `tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py`

Modify:

- `requirements.txt`
- `app/infrastructure/agent_inference_runtime/codex_client.py`
- `app/application/agent_inference_runtime/codex_process_manager.py`
- `tests/unit/application/agent_inference_runtime/test_codex_process_manager.py`
- `app/application/agent_inference_runtime/codex_run_service.py`
- `tests/unit/application/agent_inference_runtime/test_codex_run_service.py`
- `app/application/agent_inference_runtime/management.py`
- `tests/unit/application/agent_inference_runtime/test_contract_and_router.py`
- `app/di/container.py`
- `tests/unit/di/test_container_wiring.py`
- `tests/integration/test_agent_runtime_api.py`
- `frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx`
- `frontend/src/v2/pages/settings/Settings.test.tsx`
- `frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts`
- `docs/architecture/agent-runtime-platform.md`
- `docs/runbooks/local-dev.md`
- `docs/quality/testing.md`
- `Makefile`

## 3. Execution Strategy

Recommended: subagent-driven execution, one fresh subagent per task.

Parallelizable after Task 1:

- Task 2 process manager can run in parallel with Task 3 protocol codec.
- Task 7 frontend can run after Task 5 management API response shape is defined.
- Task 8 docs can start early but must finish after Task 6 live smoke names are final.

Sequential blockers:

1. Task 1 must finish before Task 3 / Task 4 because it freezes the protocol evidence.
2. Task 3 must finish before Task 4 because the WS client uses the codec.
3. Task 4 must finish before Task 5 / Task 6 because DI, management and live smoke need the client.

## Task 1: Capture Codex App Server Protocol Evidence

**Files:**

- Create: `scripts/agent_runtime/generate_codex_app_server_protocol_snapshot.py`
- Create: `tests/fixtures/agent_inference_runtime/codex_app_server_protocol_snapshot.json`
- Create: `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol_snapshot.py`

- [ ] **Step 1: Write the failing fixture test**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol_snapshot.py`:

```python
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol_snapshot.py -q
```

Expected: fail with `FileNotFoundError` because the snapshot does not exist.

- [ ] **Step 3: Add the snapshot generator**

Create `scripts/agent_runtime/generate_codex_app_server_protocol_snapshot.py`:

```python
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
```

- [ ] **Step 4: Generate the fixture**

Run:

```bash
PYTHONPATH=. python scripts/agent_runtime/generate_codex_app_server_protocol_snapshot.py
```

Expected: creates `tests/fixtures/agent_inference_runtime/codex_app_server_protocol_snapshot.json`.

- [ ] **Step 5: Verify the test passes**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol_snapshot.py -q
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/agent_runtime/generate_codex_app_server_protocol_snapshot.py \
  tests/fixtures/agent_inference_runtime/codex_app_server_protocol_snapshot.json \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol_snapshot.py
git commit -m "test: capture codex app server protocol snapshot"
```

## Task 2: Switch Process Manager to Loopback WS App Server

**Files:**

- Modify: `app/application/agent_inference_runtime/codex_process_manager.py`
- Modify: `tests/unit/application/agent_inference_runtime/test_codex_process_manager.py`

- [ ] **Step 1: Add the failing command test**

Update `test_codex_process_manager_starts_with_backend_allowlisted_profile`:

```python
def test_codex_process_manager_starts_loopback_ws_app_server(tmp_path):
    executor = _Executor()
    manager = CodexProcessManager(
        _config(
            tmp_path,
            transport="ws",
            endpoint="ws://127.0.0.1:8799",
        ),
        executor=executor,
    )

    result = manager.start()

    assert result.status == "succeeded"
    assert result.operation == "start"
    assert result.details["pid"] == 4321
    assert result.details["endpoint"] == "ws://127.0.0.1:8799"
    assert executor.calls[0]["args"] == [
        "codex",
        "app-server",
        "--listen",
        "ws://127.0.0.1:8799",
    ]
    assert executor.calls[0]["cwd"] == str(tmp_path / "project")
    assert (tmp_path / "runtime" / "codex-app-server.pid").read_text() == "4321"
```

- [ ] **Step 2: Add endpoint validation tests**

Append:

```python
@pytest.mark.parametrize("endpoint", ["", "http://127.0.0.1:8799", "ws://0.0.0.0:8799", "ws://example.com:8799"])
def test_codex_process_manager_rejects_non_loopback_ws_endpoint(tmp_path, endpoint):
    manager = CodexProcessManager(_config(tmp_path, transport="ws", endpoint=endpoint))

    with pytest.raises(CodexProcessManagerError) as exc_info:
        manager.start()

    assert exc_info.value.code == "RUNTIME_CODEX_ENDPOINT_INVALID"
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/agent_inference_runtime/test_codex_process_manager.py -q
```

Expected: command assertion and invalid endpoint assertions fail.

- [ ] **Step 4: Replace command construction**

In `CodexProcessManager.start`, replace the old `codex-app-server --socket` command with:

```python
endpoint = self._ws_endpoint()
args = ["codex", "app-server", "--listen", endpoint]
```

Return details:

```python
"endpoint": endpoint,
"transport": "ws",
```

Remove `unix_socket` from start result details.

- [ ] **Step 5: Add `_ws_endpoint`**

Add to `CodexProcessManager`:

```python
def _ws_endpoint(self) -> str:
    transport = str(self._config.get("transport") or "ws").strip().lower()
    endpoint = str(self._config.get("endpoint") or "").strip()
    if transport != "ws" or not _is_loopback_ws_endpoint(endpoint):
        raise CodexProcessManagerError(
            "Codex app-server endpoint 必须是 loopback ws:// 地址。",
            code="RUNTIME_CODEX_ENDPOINT_INVALID",
            status_code=400,
            details={"transport": transport, "endpoint": endpoint},
        )
    return endpoint
```

Add module helper:

```python
from urllib.parse import urlparse


def _is_loopback_ws_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    return parsed.scheme == "ws" and parsed.hostname in {"127.0.0.1", "localhost", "::1"} and bool(parsed.port)
```

- [ ] **Step 6: Run process manager tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/agent_inference_runtime/test_codex_process_manager.py -q
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add app/application/agent_inference_runtime/codex_process_manager.py \
  tests/unit/application/agent_inference_runtime/test_codex_process_manager.py
git commit -m "feat: start codex app server over loopback websocket"
```

## Task 3: Implement Protocol Codec and Payload Builders

**Files:**

- Modify: `requirements.txt`
- Create: `app/infrastructure/agent_inference_runtime/codex_ws_protocol.py`
- Create: `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py`

- [ ] **Step 1: Add dependency**

Append near other runtime dependencies in `requirements.txt`:

```text
websocket-client==1.8.0
```

- [ ] **Step 2: Write codec tests**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py`:

```python
from __future__ import annotations

import json

import pytest

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
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


def test_jsonrpc_codec_builds_incrementing_requests_and_parses_response():
    codec = CodexJsonRpcCodec()

    request = codec.request("initialize", {"clientInfo": {"name": "cubic3", "version": "test"}})

    assert request == {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"clientInfo": {"name": "cubic3", "version": "test"}},
    }
    assert codec.parse_response(json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})) == {"ok": True}


def test_jsonrpc_codec_raises_provider_error():
    codec = CodexJsonRpcCodec()

    with pytest.raises(CodexWsProtocolError) as exc_info:
        codec.parse_response(json.dumps({"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "bad"}}))

    assert exc_info.value.code == "RUNTIME_PROVIDER_ERROR"
    assert exc_info.value.details["provider_code"] == -32000


def test_protocol_builds_initialize_thread_and_turn_params():
    request = _request()

    assert build_initialize_params()["capabilities"]["experimentalApi"] is True
    thread = build_thread_start_params(
        request.runtime_context_ref,
        project_root="/repo/cubic3",
        runtime_workspace_roots=["/repo/cubic3"],
    )
    assert thread["cwd"] == "/repo/cubic3"
    assert thread["runtimeWorkspaceRoots"] == ["/repo/cubic3"]
    assert thread["experimentalRawEvents"] is True
    turn = build_turn_start_params(request, provider_thread_id="thread_provider_1")
    assert turn["threadId"] == "thread_provider_1"
    assert turn["input"][0]["type"] == "text"
    assert "semantic.modeling.review_proposal" in turn["input"][0]["text"]


def test_provider_run_id_round_trip_and_status_mapping():
    provider_run_id = encode_provider_run_id("thread_provider_1", "turn_provider_1")

    assert decode_provider_run_id(provider_run_id) == ("thread_provider_1", "turn_provider_1")
    assert map_turn_status("completed") == "succeeded"
    assert map_turn_status("inProgress") == "running"
    assert map_turn_status("interrupted") == "cancelled"
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py -q
```

Expected: import fails because `codex_ws_protocol.py` does not exist.

- [ ] **Step 4: Implement the codec**

Create `app/infrastructure/agent_inference_runtime/codex_ws_protocol.py` with:

```python
from __future__ import annotations

import base64
import json
from dataclasses import asdict
from typing import Any, Mapping

from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest, RuntimeContextRef


class CodexWsProtocolError(RuntimeError):
    def __init__(self, message: str, *, code: str = "RUNTIME_PROVIDER_ERROR", details: Mapping[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = dict(details or {})


class CodexJsonRpcCodec:
    def __init__(self) -> None:
        self._next_id = 1

    def request(self, method: str, params: Mapping[str, Any] | None) -> dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        return {"jsonrpc": "2.0", "id": request_id, "method": method, "params": dict(params or {})}

    def parse_response(self, raw: str) -> dict[str, Any]:
        payload = json.loads(raw)
        if "error" in payload:
            error = payload["error"] if isinstance(payload["error"], dict) else {}
            raise CodexWsProtocolError(
                str(error.get("message") or "Codex app-server returned error"),
                details={"provider_code": error.get("code"), "provider_error": error},
            )
        result = payload.get("result")
        return dict(result or {}) if isinstance(result, dict) else {"value": result}


def build_initialize_params() -> dict[str, Any]:
    return {
        "clientInfo": {"name": "cubic3-data-platform", "version": "local"},
        "capabilities": {
            "experimentalApi": True,
            "requestAttestation": False,
            "optOutNotificationMethods": [],
        },
    }


def build_thread_start_params(
    ref: RuntimeContextRef,
    *,
    project_root: str,
    runtime_workspace_roots: list[str],
) -> dict[str, Any]:
    return {
        "cwd": project_root,
        "runtimeWorkspaceRoots": list(runtime_workspace_roots),
        "approvalPolicy": "never",
        "permissions": "read-only",
        "baseInstructions": "You are reviewing Cubic3 semantic modeling artifacts. Return structured JSON only when an output schema is provided.",
        "developerInstructions": f"Runtime context: {asdict(ref)}",
        "ephemeral": False,
        "sessionStartSource": "startup",
        "experimentalRawEvents": True,
        "persistExtendedHistory": False,
    }


def build_turn_start_params(request: AgentInferenceRuntimeRequest, *, provider_thread_id: str) -> dict[str, Any]:
    text = json.dumps(
        {
            "app_id": request.app_id,
            "action": request.action,
            "principal_id": request.principal_id,
            "input": dict(request.input),
            "context_pack": dict(request.context_pack),
            "runtime_context_ref": asdict(request.runtime_context_ref),
            "output_schema": request.output_schema,
        },
        ensure_ascii=False,
    )
    return {
        "threadId": provider_thread_id,
        "input": [{"type": "text", "text": text, "text_elements": []}],
        "responsesapiClientMetadata": {
            "cubic3_action": request.action,
            "cubic3_app_id": request.app_id,
        },
    }


def encode_provider_run_id(provider_thread_id: str, provider_turn_id: str) -> str:
    raw = json.dumps({"thread_id": provider_thread_id, "turn_id": provider_turn_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def decode_provider_run_id(provider_run_id: str) -> tuple[str, str]:
    padded = provider_run_id + "=" * (-len(provider_run_id) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    return str(payload["thread_id"]), str(payload["turn_id"])


def map_turn_status(status: str) -> str:
    return {
        "completed": "succeeded",
        "inProgress": "running",
        "failed": "failed",
        "interrupted": "cancelled",
    }.get(status, "failed")
```

- [ ] **Step 5: Run protocol tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add requirements.txt app/infrastructure/agent_inference_runtime/codex_ws_protocol.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py
git commit -m "feat: add codex websocket protocol codec"
```

## Task 4: Implement Codex WebSocket Client

**Files:**

- Create: `app/infrastructure/agent_inference_runtime/codex_ws_client.py`
- Create: `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_client.py`
- Modify: `app/infrastructure/agent_inference_runtime/codex_client.py`

- [ ] **Step 1: Write fake socket tests**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_client.py`:

```python
from __future__ import annotations

import json

import pytest

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_client import CodexAppServerClientError
from app.infrastructure.agent_inference_runtime.codex_ws_client import CodexAppServerWebSocketClient


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


def test_ws_client_healthcheck_initializes_once():
    socket = _FakeWebSocket([
        {"jsonrpc": "2.0", "id": 1, "result": {"userAgent": "codex/test", "codexHome": "/tmp/codex", "platformFamily": "unix", "platformOs": "macos"}},
    ])
    client = CodexAppServerWebSocketClient(
        endpoint="ws://127.0.0.1:8799",
        project_root="/repo/cubic3",
        runtime_workspace_roots=["/repo/cubic3"],
        socket_factory=lambda endpoint, timeout: socket,
    )

    health = client.healthcheck()

    assert health["status"] == "ready"
    assert health["transport"] == "ws"
    assert socket.sent[0]["method"] == "initialize"


def test_ws_client_submit_poll_and_events_round_trip():
    request = _request()
    socket = _FakeWebSocket([
        {"jsonrpc": "2.0", "id": 1, "result": {"userAgent": "codex/test", "codexHome": "/tmp/codex", "platformFamily": "unix", "platformOs": "macos"}},
        {"jsonrpc": "2.0", "id": 2, "result": {"thread": {"id": "thread_provider_1"}}},
        {"jsonrpc": "2.0", "id": 3, "result": {"turn": {"id": "turn_provider_1", "status": "inProgress", "items": []}}},
        {"jsonrpc": "2.0", "id": 4, "result": {"data": [{"id": "turn_provider_1", "status": "completed", "items": []}], "nextCursor": None, "backwardsCursor": None}},
        {"jsonrpc": "2.0", "id": 5, "result": {"data": [{"type": "agentMessage", "id": "m1", "text": "{\"ok\": true}", "phase": None, "memoryCitation": None}], "nextCursor": None, "backwardsCursor": None}},
    ])
    client = CodexAppServerWebSocketClient(
        endpoint="ws://127.0.0.1:8799",
        project_root="/repo/cubic3",
        runtime_workspace_roots=["/repo/cubic3"],
        socket_factory=lambda endpoint, timeout: socket,
    )

    run_ref = client.submit_run(request)
    status = client.poll_run(run_ref.provider_run_id)
    events = client.stream_events(run_ref.provider_run_id)

    assert socket.sent[1]["method"] == "thread/start"
    assert socket.sent[2]["method"] == "turn/start"
    assert status["status"] == "succeeded"
    assert status["structured_output"] == {"ok": True}
    assert events["events"][0]["event_type"] == "agentMessage"


def test_ws_client_rejects_non_loopback_endpoint():
    with pytest.raises(CodexAppServerClientError) as exc_info:
        CodexAppServerWebSocketClient(
            endpoint="ws://example.com:8799",
            project_root="/repo/cubic3",
            runtime_workspace_roots=["/repo/cubic3"],
        )

    assert exc_info.value.code == "RUNTIME_CODEX_ENDPOINT_INVALID"
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_client.py -q
```

Expected: import fails because `codex_ws_client.py` does not exist.

- [ ] **Step 3: Implement the WS client**

Create `app/infrastructure/agent_inference_runtime/codex_ws_client.py`:

```python
from __future__ import annotations

import json
from typing import Any, Callable
from urllib.parse import urlparse

from websocket import create_connection

from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest, RuntimeContextRef
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


class CodexAppServerWebSocketClient:
    def __init__(
        self,
        *,
        endpoint: str,
        project_root: str,
        runtime_workspace_roots: list[str],
        timeout_seconds: int | float = 30,
        socket_factory: Callable[[str, int | float], Any] | None = None,
    ) -> None:
        if not _is_loopback_ws_endpoint(endpoint):
            raise CodexAppServerClientError(
                "Codex app-server endpoint 必须是 loopback ws:// 地址。",
                code="RUNTIME_CODEX_ENDPOINT_INVALID",
                details={"endpoint": endpoint},
                status_code=400,
            )
        self._endpoint = endpoint
        self._project_root = project_root
        self._runtime_workspace_roots = list(runtime_workspace_roots)
        self._timeout_seconds = timeout_seconds
        self._socket_factory = socket_factory or (lambda url, timeout: create_connection(url, timeout=timeout))
        self._codec = CodexJsonRpcCodec()
        self._socket = None
        self._initialize_payload: dict[str, Any] | None = None
        self._threads: dict[tuple[str, str, str], str] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}

    def close(self) -> None:
        if self._socket is not None:
            self._socket.close()
            self._socket = None

    def healthcheck(self) -> dict[str, Any]:
        payload = self._ensure_initialized()
        return {
            "status": "ready",
            "transport": "ws",
            "endpoint": self._endpoint,
            "user_agent": payload.get("userAgent"),
            "platform_os": payload.get("platformOs"),
        }

    def capabilities(self) -> dict[str, Any]:
        self._ensure_initialized()
        return {
            "transport": "ws",
            "protocol": "codex-app-server-jsonrpc",
            "actions": ["review", "repair", "audit"],
            "artifacts": ["model_patch", "workspace_summary", "diagnostic_report"],
            "events": ["turn/started", "turn/completed", "item/completed", "item/agentMessage/delta"],
        }

    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef:
        key = (ref.project_id, ref.session_id, ref.thread_id)
        if key not in self._threads:
            params = build_thread_start_params(
                ref,
                project_root=self._project_root,
                runtime_workspace_roots=self._runtime_workspace_roots,
            )
            result = self._request("thread/start", params)
            thread = result.get("thread") if isinstance(result.get("thread"), dict) else {}
            provider_thread_id = str(thread.get("id") or "")
            if not provider_thread_id:
                raise _provider_payload_error("thread/start response missing thread.id")
            self._threads[key] = provider_thread_id
        return ProviderThreadRef(self._threads[key])

    def submit_run(self, request: AgentInferenceRuntimeRequest) -> ProviderRunRef:
        thread = self.ensure_thread(request.runtime_context_ref)
        result = self._request(
            "turn/start",
            build_turn_start_params(request, provider_thread_id=thread.provider_thread_id),
        )
        turn = result.get("turn") if isinstance(result.get("turn"), dict) else {}
        provider_turn_id = str(turn.get("id") or "")
        if not provider_turn_id:
            raise _provider_payload_error("turn/start response missing turn.id")
        provider_run_id = encode_provider_run_id(thread.provider_thread_id, provider_turn_id)
        self._events.setdefault(provider_run_id, [])
        return ProviderRunRef(provider_run_id)

    def poll_run(self, provider_run_id: str) -> dict[str, Any]:
        thread_id, turn_id = decode_provider_run_id(provider_run_id)
        result = self._request("thread/turns/list", {"threadId": thread_id, "limit": 20, "itemsView": "summary"})
        turns = result.get("data") if isinstance(result.get("data"), list) else []
        turn = next((item for item in turns if isinstance(item, dict) and item.get("id") == turn_id), None)
        if turn is None:
            raise _provider_payload_error("thread/turns/list response missing requested turn")
        status = map_turn_status(str(turn.get("status") or "failed"))
        structured_output = {}
        if status in {"succeeded", "failed"}:
            items = self._turn_items(thread_id, turn_id)
            structured_output = _structured_output_from_items(items)
            self._events[provider_run_id] = _events_from_items(items)
        return {"provider_run_id": provider_run_id, "status": status, "structured_output": structured_output, "usage": {}}

    def stream_events(self, provider_run_id: str, *, cursor: str | None = None) -> dict[str, Any]:
        events = self._events.get(provider_run_id, [])
        offset = int(cursor or 0)
        return {"events": events[offset:], "next_cursor": str(len(events))}

    def cancel_run(self, provider_run_id: str) -> dict[str, Any]:
        thread_id, turn_id = decode_provider_run_id(provider_run_id)
        self._request("turn/interrupt", {"threadId": thread_id, "turnId": turn_id})
        return {"provider_run_id": provider_run_id, "status": "cancelled"}

    def collect_artifacts(self, provider_run_id: str) -> list[dict[str, Any]]:
        return []

    def _ensure_initialized(self) -> dict[str, Any]:
        if self._initialize_payload is None:
            self._initialize_payload = self._request("initialize", build_initialize_params())
        return self._initialize_payload

    def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._ensure_socket()
        request = self._codec.request(method, params)
        try:
            self._socket.send(json.dumps(request, ensure_ascii=False))
            while True:
                raw = self._socket.recv()
                payload = json.loads(raw)
                if "id" in payload:
                    return self._codec.parse_response(raw)
                self._record_notification(payload)
        except CodexWsProtocolError as exc:
            raise CodexAppServerClientError(str(exc), code=exc.code, details=exc.details) from exc
        except Exception as exc:
            raise CodexAppServerClientError(
                "Codex app-server WebSocket 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"method": method, "endpoint": self._endpoint},
            ) from exc

    def _ensure_socket(self) -> None:
        if self._socket is None:
            self._socket = self._socket_factory(self._endpoint, self._timeout_seconds)

    def _turn_items(self, thread_id: str, turn_id: str) -> list[dict[str, Any]]:
        result = self._request("thread/turns/items/list", {"threadId": thread_id, "turnId": turn_id, "limit": 200})
        data = result.get("data")
        return [dict(item) for item in data] if isinstance(data, list) else []

    def _record_notification(self, payload: dict[str, Any]) -> None:
        params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
        turn = params.get("turn") if isinstance(params.get("turn"), dict) else {}
        thread_id = str(params.get("threadId") or "")
        turn_id = str(turn.get("id") or "")
        if thread_id and turn_id:
            provider_run_id = encode_provider_run_id(thread_id, turn_id)
            self._events.setdefault(provider_run_id, []).append(
                {"event_type": str(payload.get("method") or "notification"), "payload": params}
            )


def _structured_output_from_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    for item in reversed(items):
        if item.get("type") == "agentMessage" and isinstance(item.get("text"), str):
            try:
                value = json.loads(item["text"])
            except json.JSONDecodeError:
                return {"message": item["text"]}
            return value if isinstance(value, dict) else {"value": value}
    return {}


def _events_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"event_type": str(item.get("type") or "item"), "payload": item} for item in items]


def _provider_payload_error(message: str) -> CodexAppServerClientError:
    return CodexAppServerClientError(message, code="RUNTIME_INVALID_OUTPUT", status_code=502)


def _is_loopback_ws_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    return parsed.scheme == "ws" and parsed.hostname in {"127.0.0.1", "localhost", "::1"} and bool(parsed.port)
```

- [ ] **Step 4: Run unit tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_protocol.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_client.py \
  -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/infrastructure/agent_inference_runtime/codex_client.py \
  app/infrastructure/agent_inference_runtime/codex_ws_client.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_ws_client.py
git commit -m "feat: add codex websocket client"
```

## Task 5: Align Codex Run Service and Management API

**Files:**

- Modify: `app/application/agent_inference_runtime/codex_run_service.py`
- Modify: `tests/unit/application/agent_inference_runtime/test_codex_run_service.py`
- Modify: `app/application/agent_inference_runtime/management.py`
- Modify: `tests/unit/application/agent_inference_runtime/test_contract_and_router.py`
- Modify: `app/di/container.py`
- Modify: `tests/unit/di/test_container_wiring.py`
- Modify: `tests/integration/test_agent_runtime_api.py`

- [ ] **Step 1: Update CodexRunService test to use ProviderRunRef**

In `tests/unit/application/agent_inference_runtime/test_codex_run_service.py`, update the fake client submit method:

```python
from app.infrastructure.agent_inference_runtime.codex_client import ProviderRunRef


class _Client:
    def __init__(self):
        self.submitted_requests = []

    def submit_run(self, request):
        self.submitted_requests.append(request)
        return ProviderRunRef("provider_run_1")
```

Assert:

```python
assert client.submitted_requests[0].action == "semantic.modeling.review_proposal"
```

- [ ] **Step 2: Change CodexRunService to pass the domain request**

In `CodexRunService.submit`, replace:

```python
payload = _request_payload(request)
provider_payload = self._client.submit_run(payload)
provider_payload = _dict_or_error(provider_payload)
provider_run_id = _provider_run_id(provider_payload)
status = _status(provider_payload, default="queued")
```

with:

```python
provider_run = self._client.submit_run(request)
provider_run_id = str(provider_run.provider_run_id)
status = "queued"
```

Keep `_request_payload` for workspace/debug payload only if still used by tests; remove it if no remaining reference exists.

- [ ] **Step 3: Add management tests for WS health and capabilities**

In `test_contract_and_router.py`, add a fake WS client:

```python
class _FakeCodexWsClient:
    def __init__(self):
        self.calls = []

    def healthcheck(self):
        self.calls.append("healthcheck")
        return {"status": "ready", "transport": "ws", "user_agent": "codex/test"}

    def capabilities(self):
        self.calls.append("capabilities")
        return {"transport": "ws", "actions": ["review"], "artifacts": ["diagnostic_report"], "events": ["turn/completed"]}
```

Add tests:

```python
def test_runtime_management_codex_ws_test_provider_uses_ws_client():
    client = _FakeCodexWsClient()
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True, "transport": "ws", "endpoint": "ws://127.0.0.1:8799"},
        codex_ws_client_factory=lambda config: client,
    )

    result = service.test_provider("codex_app_server", principal_id="alice")

    assert client.calls == ["healthcheck"]
    assert result.status == "ready"
    assert result.details["health"]["transport"] == "ws"


def test_runtime_management_codex_ws_capabilities_use_ws_client():
    client = _FakeCodexWsClient()
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True, "transport": "ws", "endpoint": "ws://127.0.0.1:8799"},
        codex_ws_client_factory=lambda config: client,
    )

    capabilities = service.provider_capabilities("codex_app_server")

    assert client.calls == ["capabilities"]
    assert capabilities.available is True
    assert capabilities.actions == ["review"]
```

- [ ] **Step 4: Implement explicit WS client factory in management**

In `AgentRuntimeManagementService.__init__`, restore a generic client factory:

```python
codex_ws_client_factory: Callable[[Mapping[str, Any]], Any] | None = None,
```

Set:

```python
self._codex_ws_client_factory = codex_ws_client_factory
```

Add:

```python
def _codex_ws_client(self, config: Mapping[str, Any]) -> Any:
    if self._codex_ws_client_factory is None:
        raise RuntimeError("codex client factory is not configured")
    return self._codex_ws_client_factory(config)
```

Use it only when:

```python
str(config.get("transport") or "ws").strip().lower() == "ws"
```

Map failed `CodexAppServerClientError` to `RuntimeProviderStatus(status="unavailable")` with `provider_error`.

- [ ] **Step 5: Wire DI to real WS client**

In `app/di/container.py`, import:

```python
from app.infrastructure.agent_inference_runtime.codex_ws_client import CodexAppServerWebSocketClient
```

Replace `agent_codex_unavailable_client` with:

```python
agent_codex_ws_client = providers.Factory(
    CodexAppServerWebSocketClient,
    endpoint=config.agent_codex.endpoint,
    project_root=config.agent_codex.project_root,
    runtime_workspace_roots=providers.List(config.agent_codex.project_root),
    timeout_seconds=config.agent_codex.timeout_seconds,
)
```

Wire:

```python
codex_run_service = providers.Factory(
    CodexRunService,
    client=agent_codex_ws_client,
    repository=agent_inference_runtime_repository,
)
agent_runtime_management_service = providers.Factory(
    AgentRuntimeManagementService,
    openai_config=config.agent_openai,
    codex_config=config.agent_codex,
    action_bindings=agent_runtime_action_bindings,
    runtime_config_service=agent_runtime_config_service,
    codex_ws_client_factory=agent_codex_ws_client.provider,
)
```

- [ ] **Step 6: Update DI test**

Replace the placeholder assertion in `test_container_wiring.py` with:

```python
def test_codex_run_service_wires_websocket_client():
    container = Container()
    container.config.agent_codex.endpoint.from_value("ws://127.0.0.1:8799")
    container.config.agent_codex.project_root.from_value("/tmp/cubic3")
    container.config.agent_codex.timeout_seconds.from_value(5)

    client = container.agent_codex_ws_client()

    assert client._endpoint == "ws://127.0.0.1:8799"
```

- [ ] **Step 7: Run backend runtime tests**

Run:

```bash
make test-platform-agent-runtime
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add app/application/agent_inference_runtime/codex_run_service.py \
  app/application/agent_inference_runtime/management.py \
  app/di/container.py \
  tests/unit/application/agent_inference_runtime/test_codex_run_service.py \
  tests/unit/application/agent_inference_runtime/test_contract_and_router.py \
  tests/unit/di/test_container_wiring.py \
  tests/integration/test_agent_runtime_api.py
git commit -m "feat: wire codex websocket runtime"
```

## Task 6: Add Real Codex WS Live Smoke

**Files:**

- Create: `tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py`
- Modify: `Makefile`
- Modify: `docs/quality/testing.md`

- [ ] **Step 1: Create live smoke**

Create `tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py`:

```python
from __future__ import annotations

import os

import pytest

from app.infrastructure.agent_inference_runtime.codex_ws_client import CodexAppServerWebSocketClient


pytestmark = pytest.mark.skipif(
    os.getenv("AGENT_CODEX_LIVE") != "1" or os.getenv("AGENT_CODEX_TRANSPORT") != "ws",
    reason="set AGENT_CODEX_LIVE=1 and AGENT_CODEX_TRANSPORT=ws to run Codex WS live smoke",
)


def test_codex_ws_live_smoke_initializes_and_reports_capabilities():
    endpoint = os.getenv("AGENT_CODEX_ENDPOINT", "").strip()
    project_root = os.getenv("AGENT_CODEX_PROJECT_ROOT", os.getcwd())
    assert endpoint.startswith("ws://127.0.0.1:") or endpoint.startswith("ws://localhost:")

    client = CodexAppServerWebSocketClient(
        endpoint=endpoint,
        project_root=project_root,
        runtime_workspace_roots=[project_root],
        timeout_seconds=float(os.getenv("AGENT_CODEX_TIMEOUT_SECONDS", "10")),
    )
    try:
        health = client.healthcheck()
        capabilities = client.capabilities()
    finally:
        client.close()

    assert health["status"] == "ready"
    assert health["transport"] == "ws"
    assert capabilities["protocol"] == "codex-app-server-jsonrpc"
```

- [ ] **Step 2: Keep live smoke opt-in**

Do not add this file to default `make verify`. Add it to `test-platform-agent-runtime` only if the skip mark is always active by default:

```make
tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py
```

- [ ] **Step 3: Run default tests**

Run:

```bash
make test-platform-agent-runtime
```

Expected: live smoke is skipped unless env is explicitly set.

- [ ] **Step 4: Run real local smoke**

In one terminal:

```bash
codex app-server --listen ws://127.0.0.1:8799
```

In the repo:

```bash
AGENT_CODEX_LIVE=1 \
AGENT_CODEX_TRANSPORT=ws \
AGENT_CODEX_ENDPOINT=ws://127.0.0.1:8799 \
AGENT_CODEX_PROJECT_ROOT="$(pwd)" \
PYTHONPATH=. python -m pytest --no-cov tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py -q
```

Expected: initialize / capabilities smoke passes. If Codex auth is missing, record the exact provider error and keep default tests green.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py Makefile docs/quality/testing.md
git commit -m "test: add codex websocket live smoke"
```

## Task 7: Update Frontend Runtime Settings UX

**Files:**

- Modify: `frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx`
- Modify: `frontend/src/v2/pages/settings/Settings.test.tsx`
- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts`

- [ ] **Step 1: Add Settings unit test assertions**

In `Settings.test.tsx`, assert Codex details render transport and endpoint:

```tsx
expect(screen.getByText('transport')).toBeInTheDocument()
expect(screen.getByText('ws')).toBeInTheDocument()
expect(screen.getByText('ws://127.0.0.1:8799')).toBeInTheDocument()
```

- [ ] **Step 2: Render provider details**

In `AgentRuntimeSettings.tsx`, add a compact details section:

```tsx
function RuntimeDetails({ provider }: { provider: AgentRuntimeProviderStatus }) {
  const details = provider.details && typeof provider.details === 'object' ? provider.details : {}
  const rows = ['transport', 'endpoint', 'project_root', 'runtime_root']
    .map((key) => [key, String((details as Record<string, unknown>)[key] ?? '')] as const)
    .filter(([, value]) => value.length > 0)
  if (!rows.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <RuntimeField key={key} label={key} value={value} />
      ))}
    </div>
  )
}
```

Call it below the status message:

```tsx
<RuntimeDetails provider={provider} />
```

- [ ] **Step 3: Keep controls platform-scoped**

Do not add runtime selectors to Copilot. Keep `启动 Codex` only in AI Runtime settings and only when backend exposes `start`.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd frontend && npm test -- Settings
cd frontend && npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx \
  frontend/src/v2/pages/settings/Settings.test.tsx \
  frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts
git commit -m "feat: show codex websocket runtime settings"
```

## Task 8: Documentation and Release Verification

**Files:**

- Modify: `docs/architecture/agent-runtime-platform.md`
- Modify: `docs/runbooks/local-dev.md`
- Modify: `docs/quality/testing.md`
- Modify: `docs/superpowers/plans/2026-05-29-codex-app-server-ws-runtime-fix.md`

- [ ] **Step 1: Update active architecture**

Ensure `docs/architecture/agent-runtime-platform.md` states:

```markdown
Codex app-server 主链路是 loopback WebSocket：`codex app-server --listen ws://127.0.0.1:<port>`。平台通过 `CodexAppServerWebSocketClient` 调用 JSON-RPC protocol，`test_provider` 使用 initialize healthcheck，`provider_capabilities` 使用 WS capabilities。
```

- [ ] **Step 2: Update local runbook**

Ensure `docs/runbooks/local-dev.md` contains:

```bash
codex app-server --listen ws://127.0.0.1:8799
export AGENT_CODEX_ENABLED=true
export AGENT_CODEX_TRANSPORT=ws
export AGENT_CODEX_ENDPOINT=ws://127.0.0.1:8799
export AGENT_CODEX_PROJECT_ROOT="$(pwd)"
export AGENT_CODEX_ALLOWED_PROJECT_ROOTS="$(pwd)"
```

- [ ] **Step 3: Search stale language**

Run:

```bash
rg -n "codex_http_client|CodexAppServerHttpClient|legacy_http|HTTP-shaped|test_codex_live_smoke|codex_client_factory|AGENT_CODEX_UNIX_SOCKET" app tests docs/architecture docs/runbooks docs/quality Makefile README.md
```

Expected: no matches.

- [ ] **Step 4: Run final verification**

Run:

```bash
make test-platform-agent-runtime
make verify-docs
git diff --check
```

Expected:

- `make test-platform-agent-runtime` passes.
- `make verify-docs` passes.
- `git diff --check` exits 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/architecture/agent-runtime-platform.md docs/runbooks/local-dev.md docs/quality/testing.md \
  docs/superpowers/plans/2026-05-29-codex-app-server-ws-runtime-fix.md
git commit -m "docs: document codex websocket runtime"
```

## Acceptance Criteria

- No Codex HTTP client implementation remains.
- `CodexProcessManager` starts `codex app-server --listen ws://127.0.0.1:<port>` without accepting frontend command input.
- `CodexAppServerWebSocketClient` implements `healthcheck / capabilities / ensure_thread / submit_run / poll_run / stream_events / cancel_run / collect_artifacts`.
- `test_provider("codex_app_server")` uses WS healthcheck and returns `ready` only after app-server responds.
- `provider_capabilities("codex_app_server")` reflects WS protocol capabilities or an explicit provider error.
- `CodexRunService` stores provider run refs from real WS turn ids.
- Default verification does not require a real Codex app-server.
- Opt-in live smoke proves initialize and capabilities against a real local `codex app-server`.
- Frontend settings page shows transport / endpoint and keeps start / restart controls in platform settings only.

## Engineering Principles Check

- KISS：不新增独立 gateway；只实现平台内 WS adapter。
- YAGNI：不实现 non-loopback auth、Unix socket adapter、stdio adapter；这些只保留为架构说明。
- SOLID：protocol codec、WS transport、process manager、run service、management API 分层独立。
- DRY：Codex review / repair / audit 统一走 `CodexRunService` 和 `CodexAppServerClient`，不为每个业务模块复制 app-server 调用逻辑。
