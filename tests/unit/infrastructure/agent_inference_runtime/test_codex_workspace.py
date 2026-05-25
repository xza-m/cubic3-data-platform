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

    with pytest.raises(ValueError, match="artifact path"):
        store.resolve_artifact_path(ref, "../secret.txt")


@pytest.mark.parametrize(
    "relative_path",
    [
        "/tmp/evil.json",
        "nested/../x.json",
        "nested//x.json",
        "./x.json",
        "",
    ],
)
def test_codex_workspace_rejects_unsafe_artifact_segments(
    tmp_path: Path,
    relative_path: str,
):
    store = CodexWorkspaceStore(runtime_root=tmp_path)
    ref = RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "turn_1")
    store.prepare_turn(ref, request_payload={}, runtime_policy={})

    with pytest.raises(ValueError, match="artifact path"):
        store.resolve_artifact_path(ref, relative_path)


def test_codex_workspace_rejects_artifact_symlink_escape(tmp_path: Path):
    store = CodexWorkspaceStore(runtime_root=tmp_path)
    ref = RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "turn_1")
    turn_dir = store.prepare_turn(ref, request_payload={}, runtime_policy={})
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    link_path = turn_dir / "artifacts" / "external"
    try:
        link_path.symlink_to(external_dir, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"当前环境不支持 symlink: {exc}")

    with pytest.raises(ValueError, match="artifact path escapes"):
        store.resolve_artifact_path(ref, "external/result.json")


@pytest.mark.parametrize(
    ("ref", "field_name"),
    [
        (RuntimeContextRef("../project", "session_1", "thread_1", "turn_1"), "project_id"),
        (
            RuntimeContextRef("cubic3-data-platform", "session/1", "thread_1", "turn_1"),
            "session_id",
        ),
        (RuntimeContextRef("cubic3-data-platform", "session_1", "", "turn_1"), "thread_id"),
        (RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "."), "turn_id"),
        (
            RuntimeContextRef(None, "session_1", "thread_1", "turn_1"),  # type: ignore[arg-type]
            "project_id",
        ),
    ],
)
def test_codex_workspace_rejects_context_path_escape(
    tmp_path: Path,
    ref: RuntimeContextRef,
    field_name: str,
):
    store = CodexWorkspaceStore(runtime_root=tmp_path)

    with pytest.raises(ValueError, match=field_name):
        store.prepare_turn(ref, request_payload={}, runtime_policy={})


def test_codex_workspace_wraps_json_serialization_error_with_target_path(tmp_path: Path):
    store = CodexWorkspaceStore(runtime_root=tmp_path)
    ref = RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "turn_1")

    with pytest.raises(ValueError, match="request.json"):
        store.prepare_turn(ref, request_payload={"bad": object()}, runtime_policy={})


def test_command_policy_star_matches_single_argument_only():
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
    with pytest.raises(PermissionError, match="RUNTIME_TOOL_FORBIDDEN"):
        policy.assert_allowed(["python", "-m", "pytest", "tests/unit", "-q"], cwd="/repo")

    with pytest.raises(PermissionError, match="RUNTIME_TOOL_FORBIDDEN"):
        policy.assert_allowed(["rm", "-rf", "app"], cwd="/repo")


def test_command_policy_double_star_allows_valid_pytest_tail_only():
    policy = CommandPolicy.from_dict(
        {
            "allowed_commands": [
                {
                    "id": "pytest_tail",
                    "command": "python",
                    "args_pattern": ["-m", "pytest", "**"],
                    "requires_approval": False,
                }
            ],
            "network": "disabled",
        }
    )

    policy.assert_allowed(["python", "-m", "pytest", "tests/unit", "-q"], cwd="/repo")

    blocked_argvs = [
        ["python", "-m", "pytest", "/tmp/evil_tests"],
        ["python", "-m", "pytest", "../tests"],
        ["python", "-m", "pytest", "app"],
        ["python", "-m", "pytest", "tests/unit", "--override-ini", "pythonpath=/tmp"],
        ["python", "-m", "pytest", "tests/unit", "--override-ini=pythonpath=/tmp"],
    ]
    for argv in blocked_argvs:
        with pytest.raises(PermissionError, match="RUNTIME_TOOL_FORBIDDEN"):
            policy.assert_allowed(argv, cwd="/repo")


def test_command_policy_requires_approval_is_not_silent_allow():
    policy = CommandPolicy.from_dict(
        {
            "allowed_commands": [
                {
                    "id": "pytest_approval",
                    "command": "python",
                    "args_pattern": ["-m", "pytest", "tests/unit"],
                    "requires_approval": True,
                }
            ],
            "network": "disabled",
        }
    )

    decision = policy.evaluate(["python", "-m", "pytest", "tests/unit"], cwd="/repo")

    assert decision.allowed is False
    assert decision.requires_approval is True
    assert decision.rule_id == "pytest_approval"
    with pytest.raises(PermissionError, match="RUNTIME_TOOL_APPROVAL_REQUIRED"):
        policy.assert_allowed(["python", "-m", "pytest", "tests/unit"], cwd="/repo")


def test_codex_client_provider_refs_are_contract_values():
    assert (
        ProviderThreadRef(provider_thread_id="thread_provider").provider_thread_id
        == "thread_provider"
    )
    assert ProviderRunRef(provider_run_id="run_provider").provider_run_id == "run_provider"
