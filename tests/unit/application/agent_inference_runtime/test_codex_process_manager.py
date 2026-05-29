from __future__ import annotations

from pathlib import Path

import pytest

from app.application.agent_inference_runtime.codex_process_manager import (
    CodexProcessManager,
    CodexProcessManagerError,
)


class _StartedProcess:
    pid = 4321


class _Executor:
    def __init__(self) -> None:
        self.calls = []

    def __call__(self, args, *, cwd, env, stdout, stderr):
        self.calls.append(
            {
                "args": list(args),
                "cwd": str(cwd),
                "env": dict(env),
                "stdout": stdout,
                "stderr": stderr,
            }
        )
        return _StartedProcess()


class _Terminator:
    def __init__(self) -> None:
        self.pids: list[int] = []

    def __call__(self, pid: int) -> None:
        self.pids.append(pid)


def _config(tmp_path: Path, **overrides):
    runtime_root = tmp_path / "runtime"
    project_root = tmp_path / "project"
    project_root.mkdir()
    base = {
        "enabled": True,
        "ui_managed": True,
        "server_managed": True,
        "command_profile": "local-codex-app-server",
        "project_id": "cubic3-data-platform",
        "project_root": str(project_root),
        "runtime_root": str(runtime_root),
        "allowed_project_roots": str(tmp_path),
    }
    base.update(overrides)
    return base


def test_codex_process_manager_blocks_start_when_ui_management_disabled(tmp_path):
    manager = CodexProcessManager(_config(tmp_path, ui_managed=False))

    with pytest.raises(CodexProcessManagerError) as exc_info:
        manager.start()

    assert exc_info.value.code == "RUNTIME_OPERATION_DISABLED"
    assert exc_info.value.status_code == 403


def test_codex_process_manager_rejects_unknown_command_profile(tmp_path):
    manager = CodexProcessManager(_config(tmp_path, command_profile="shell"))

    with pytest.raises(CodexProcessManagerError) as exc_info:
        manager.start()

    assert exc_info.value.code == "RUNTIME_COMMAND_PROFILE_NOT_ALLOWED"
    assert exc_info.value.status_code == 400


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
    assert result.details["transport"] == "ws"
    assert executor.calls[0]["args"] == [
        "codex",
        "app-server",
        "--listen",
        "ws://127.0.0.1:8799",
    ]
    assert executor.calls[0]["cwd"] == str(tmp_path / "project")
    assert (tmp_path / "runtime" / "codex-app-server.pid").read_text() == "4321"


@pytest.mark.parametrize(
    "endpoint",
    [
        "",
        "http://127.0.0.1:8799",
        "ws://0.0.0.0:8799",
        "ws://example.com:8799",
        "ws://127.0.0.1",
        "ws://127.0.0.1:abc",
        "ws://127.0.0.1:99999",
    ],
)
def test_codex_process_manager_rejects_non_loopback_ws_endpoint(tmp_path, endpoint):
    manager = CodexProcessManager(_config(tmp_path, transport="ws", endpoint=endpoint))

    with pytest.raises(CodexProcessManagerError) as exc_info:
        manager.start()

    assert exc_info.value.code == "RUNTIME_CODEX_ENDPOINT_INVALID"


def test_codex_process_manager_rejects_project_root_outside_allowed_roots(tmp_path):
    project_root = tmp_path / "outside"
    project_root.mkdir()
    allowed_root = tmp_path / "allowed"
    allowed_root.mkdir()
    manager = CodexProcessManager(
        _config(
            tmp_path,
            project_root=str(project_root),
            allowed_project_roots=str(allowed_root),
        )
    )

    with pytest.raises(CodexProcessManagerError) as exc_info:
        manager.start()

    assert exc_info.value.code == "RUNTIME_PROJECT_ROOT_NOT_ALLOWED"


def test_codex_process_manager_reads_log_tail_and_static_capabilities(tmp_path):
    manager = CodexProcessManager(_config(tmp_path))
    log_path = tmp_path / "runtime" / "logs" / "codex-app-server.log"
    log_path.parent.mkdir(parents=True)
    log_path.write_text("line1\nline2\nline3\n")

    logs = manager.logs(tail_lines=2)
    capabilities = manager.capabilities()

    assert logs.lines == ["line2", "line3"]
    assert capabilities.available is True
    assert "review" in capabilities.actions


def test_codex_process_manager_stop_uses_pid_file_without_shell(tmp_path):
    terminator = _Terminator()
    manager = CodexProcessManager(_config(tmp_path), terminator=terminator)
    pid_file = tmp_path / "runtime" / "codex-app-server.pid"
    pid_file.parent.mkdir(parents=True)
    pid_file.write_text("4321")

    result = manager.stop()

    assert result.status == "succeeded"
    assert terminator.pids == [4321]
    assert not pid_file.exists()
