from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.domain.agent_inference_runtime.types import RuntimeContextRef
from app.infrastructure.agent_inference_runtime.codex_client import (
    ProviderRunRef,
    ProviderThreadRef,
)
from app.infrastructure.agent_inference_runtime.codex_workspace import CodexWorkspaceStore
from app.infrastructure.agent_inference_runtime.command_policy import CommandPolicy


def test_codex_workspace_writes_turn_contract(tmp_path: Path):
    store = CodexWorkspaceStore(runtime_root=tmp_path)
    ref = RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "turn_1")

    turn_dir = store.prepare_turn(
        ref,
        request_payload={"input": {"message": "review"}},
        runtime_policy={"max_runtime_seconds": 300},
    )

    assert turn_dir == (
        tmp_path.resolve()
        / "projects"
        / "cubic3-data-platform"
        / "sessions"
        / "session_1"
        / "threads"
        / "thread_1"
        / "turns"
        / "turn_1"
    )
    assert json.loads((turn_dir / "request.json").read_text(encoding="utf-8")) == {
        "input": {"message": "review"}
    }
    assert json.loads((turn_dir / "runtime_policy.json").read_text(encoding="utf-8"))[
        "max_runtime_seconds"
    ] == 300
    assert json.loads((turn_dir / "turn_ref.json").read_text(encoding="utf-8")) == {
        "project_id": "cubic3-data-platform",
        "session_id": "session_1",
        "thread_id": "thread_1",
        "turn_id": "turn_1",
    }
    assert (turn_dir / "artifacts").is_dir()


def test_codex_workspace_rejects_artifact_path_escape(tmp_path: Path):
    store = CodexWorkspaceStore(runtime_root=tmp_path)
    ref = RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "turn_1")
    store.prepare_turn(ref, request_payload={}, runtime_policy={})

    with pytest.raises(ValueError, match="artifact path escapes"):
        store.resolve_artifact_path(ref, "../secret.txt")


@pytest.mark.parametrize(
    "ref",
    [
        RuntimeContextRef("../project", "session_1", "thread_1", "turn_1"),
        RuntimeContextRef("cubic3-data-platform", "session/1", "thread_1", "turn_1"),
        RuntimeContextRef("cubic3-data-platform", "session_1", "", "turn_1"),
        RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "."),
    ],
)
def test_codex_workspace_rejects_context_path_escape(tmp_path: Path, ref: RuntimeContextRef):
    store = CodexWorkspaceStore(runtime_root=tmp_path)

    with pytest.raises(ValueError, match="runtime path segment invalid"):
        store.prepare_turn(ref, request_payload={}, runtime_policy={})


def test_command_policy_allows_pytest_pattern_and_rejects_unlisted_command():
    policy = CommandPolicy.from_dict(
        {
            "allowed_commands": [
                {
                    "command": "python",
                    "args_pattern": ["-m", "pytest", "*"],
                    "requires_approval": False,
                }
            ],
            "network": "disabled",
        }
    )

    policy.assert_allowed(["python", "-m", "pytest", "tests/unit"], cwd="/repo")
    policy.assert_allowed(
        ["python", "-m", "pytest", "tests/unit", "-q"],
        cwd="/repo",
    )

    with pytest.raises(PermissionError, match="RUNTIME_TOOL_FORBIDDEN"):
        policy.assert_allowed(["rm", "-rf", "app"], cwd="/repo")


def test_codex_client_provider_refs_are_contract_values():
    assert (
        ProviderThreadRef(provider_thread_id="thread_provider").provider_thread_id
        == "thread_provider"
    )
    assert ProviderRunRef(provider_run_id="run_provider").provider_run_id == "run_provider"
