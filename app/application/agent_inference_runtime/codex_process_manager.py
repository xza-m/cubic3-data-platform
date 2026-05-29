"""受控 Codex app-server 进程管理。"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
import signal
import subprocess
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import urlparse

from app.domain.agent_inference_runtime.types import (
    RuntimeOperationResult,
    RuntimeProviderCapabilities,
    RuntimeProviderLogView,
)


class CodexProcessManagerError(Exception):
    def __init__(self, message: str, *, code: str, status_code: int = 400, details: Mapping[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = dict(details or {})


class CodexProcessManager:
    """只允许通过后端白名单 profile 管理 Codex app-server。

    前端不能传任意 command；这里也不使用 shell。
    """

    _PROFILE = "local-codex-app-server"

    def __init__(
        self,
        config: Mapping[str, Any],
        *,
        executor: Callable[..., Any] | None = None,
        terminator: Callable[[int], None] | None = None,
        process_checker: Callable[[int, dict[str, Any]], bool] | None = None,
    ) -> None:
        self._config = config
        self._executor = executor or _popen_executor
        self._terminator = terminator or _terminate_pid
        self._process_checker = process_checker or _is_expected_codex_process

    def start(self) -> RuntimeOperationResult:
        self._ensure_start_allowed()
        project_root = self._project_root()
        runtime_root = self._runtime_root()
        runtime_root.mkdir(parents=True, exist_ok=True)
        log_path = self._log_path()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        endpoint = self._ws_endpoint()
        args = [
            "codex",
            "app-server",
            "--listen",
            endpoint,
        ]
        with log_path.open("ab") as log_file:
            process = self._executor(
                args,
                cwd=project_root,
                env=self._process_env(runtime_root),
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
        pid = int(getattr(process, "pid", 0) or 0)
        metadata = self._pid_metadata(
            pid=pid,
            project_root=project_root,
            runtime_root=runtime_root,
            log_path=log_path,
            endpoint=endpoint,
        )
        self._pid_file().write_text(json.dumps(metadata, ensure_ascii=True, sort_keys=True), encoding="utf-8")
        return RuntimeOperationResult(
            runtime_name="codex_app_server",
            operation="start",
            status="succeeded",
            message="已提交 Codex app-server 启动。",
            details={
                "pid": pid,
                "command_profile": self._PROFILE,
                "cwd": str(project_root),
                "log_path": str(log_path),
                "endpoint": endpoint,
                "transport": "ws",
            },
        )

    def stop(self) -> RuntimeOperationResult:
        pid_file = self._pid_file()
        if not pid_file.exists():
            return RuntimeOperationResult(
                runtime_name="codex_app_server",
                operation="stop",
                status="succeeded",
                message="没有记录运行中的 Codex app-server。",
                details={},
            )
        metadata = _read_pid_metadata(pid_file)
        if metadata is None:
            pid_file.unlink(missing_ok=True)
            return RuntimeOperationResult(
                runtime_name="codex_app_server",
                operation="stop",
                status="succeeded",
                message="已清理陈旧的 Codex app-server PID 文件。",
                details={"stale_pid_file": True},
            )
        pid = int(metadata["pid"])
        if not self._process_checker(pid, metadata):
            pid_file.unlink(missing_ok=True)
            return RuntimeOperationResult(
                runtime_name="codex_app_server",
                operation="stop",
                status="succeeded",
                message="已清理陈旧的 Codex app-server PID 文件。",
                details={"pid": pid, "stale_pid_file": True},
            )
        self._terminator(pid)
        pid_file.unlink(missing_ok=True)
        return RuntimeOperationResult(
            runtime_name="codex_app_server",
            operation="stop",
            status="succeeded",
            message="已停止 Codex app-server。",
            details={"pid": pid},
        )

    def restart(self) -> RuntimeOperationResult:
        self.stop()
        result = self.start()
        return RuntimeOperationResult(
            runtime_name=result.runtime_name,
            operation="restart",
            status=result.status,
            message="已重启 Codex app-server。",
            details=result.details,
        )

    def logs(self, *, tail_lines: int = 200) -> RuntimeProviderLogView:
        log_path = self._log_path()
        if not log_path.exists():
            return RuntimeProviderLogView(
                runtime_name="codex_app_server",
                log_path=str(log_path),
                lines=[],
                truncated=False,
            )
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        return RuntimeProviderLogView(
            runtime_name="codex_app_server",
            log_path=str(log_path),
            lines=lines[-tail_lines:],
            truncated=len(lines) > tail_lines,
        )

    def capabilities(self) -> RuntimeProviderCapabilities:
        return RuntimeProviderCapabilities(
            runtime_name="codex_app_server",
            available=_as_bool(self._config.get("enabled")),
            actions=["review", "repair", "audit"],
            artifacts=["model_patch", "workspace_summary", "diagnostic_report"],
            events=["run.started", "run.progress", "run.succeeded", "run.failed"],
            details={
                "command_profile": str(self._config.get("command_profile") or self._PROFILE),
                "server_managed": _as_bool(self._config.get("server_managed")),
            },
        )

    def _ensure_start_allowed(self) -> None:
        if not _as_bool(self._config.get("ui_managed")):
            raise CodexProcessManagerError(
                "Codex app-server UI 管理未启用。",
                code="RUNTIME_OPERATION_DISABLED",
                status_code=403,
            )
        if not _as_bool(self._config.get("server_managed")):
            raise CodexProcessManagerError(
                "Codex app-server 后端托管未启用。",
                code="RUNTIME_SERVER_MANAGED_DISABLED",
                status_code=403,
            )
        profile = str(self._config.get("command_profile") or self._PROFILE)
        if profile != self._PROFILE:
            raise CodexProcessManagerError(
                "Codex app-server command profile 不在白名单内。",
                code="RUNTIME_COMMAND_PROFILE_NOT_ALLOWED",
                details={"command_profile": profile},
            )
        self._assert_project_root_allowed(self._project_root())

    def _assert_project_root_allowed(self, project_root: Path) -> None:
        allowed = _split_paths(self._config.get("allowed_project_roots"))
        if not allowed:
            raise CodexProcessManagerError(
                "Codex app-server 缺少 allowed project roots。",
                code="RUNTIME_ALLOWED_ROOTS_MISSING",
            )
        if not any(_is_relative_to(project_root, root) for root in allowed):
            raise CodexProcessManagerError(
                "Codex app-server project root 不在允许目录内。",
                code="RUNTIME_PROJECT_ROOT_NOT_ALLOWED",
                details={"project_root": str(project_root), "allowed_project_roots": [str(root) for root in allowed]},
            )

    def _project_root(self) -> Path:
        return Path(str(self._config.get("project_root") or ".")).expanduser().resolve()

    def _runtime_root(self) -> Path:
        return Path(str(self._config.get("runtime_root") or ".cubic3/agent-codex")).expanduser().resolve()

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

    def _pid_file(self) -> Path:
        runtime_root = self._runtime_root()
        runtime_root.mkdir(parents=True, exist_ok=True)
        return runtime_root / "codex-app-server.pid"

    def _log_path(self) -> Path:
        return self._runtime_root() / "logs" / "codex-app-server.log"

    def _process_env(self, runtime_root: Path) -> dict[str, str]:
        env = dict(os.environ)
        env["CODEX_HOME"] = str(runtime_root / "home")
        env["AGENT_CODEX_PROJECT_ID"] = str(self._config.get("project_id") or "cubic3-data-platform")
        return env

    def _pid_metadata(
        self,
        *,
        pid: int,
        project_root: Path,
        runtime_root: Path,
        log_path: Path,
        endpoint: str,
    ) -> dict[str, Any]:
        return {
            "pid": pid,
            "command_profile": self._PROFILE,
            "cwd": str(project_root),
            "runtime_root": str(runtime_root),
            "log_path": str(log_path),
            "endpoint": endpoint,
            "transport": "ws",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }


def _popen_executor(args, *, cwd, env, stdout, stderr):
    return subprocess.Popen(args, cwd=cwd, env=env, stdout=stdout, stderr=stderr)


def _terminate_pid(pid: int) -> None:
    os.kill(pid, signal.SIGTERM)


def _read_pid_metadata(pid_file: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(pid_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    try:
        pid = int(payload.get("pid"))
    except (TypeError, ValueError):
        return None
    if pid <= 0:
        return None
    command_profile = str(payload.get("command_profile") or "")
    if command_profile != CodexProcessManager._PROFILE:
        return None
    return {**payload, "pid": pid}


def _is_expected_codex_process(pid: int, metadata: dict[str, Any]) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:
        completed = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except Exception:
        return False
    command = completed.stdout.strip()
    if completed.returncode != 0 or not command:
        return False
    endpoint = str(metadata.get("endpoint") or "")
    return "codex" in command and "app-server" in command and (not endpoint or endpoint in command)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _split_paths(value: Any) -> list[Path]:
    if value is None:
        return []
    raw_items = value if isinstance(value, (list, tuple, set)) else str(value).split(",")
    return [Path(str(item)).expanduser().resolve() for item in raw_items if str(item).strip()]


def _is_loopback_ws_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    try:
        port = parsed.port
    except ValueError:
        return False
    return parsed.scheme == "ws" and parsed.hostname in {"127.0.0.1", "localhost", "::1"} and bool(port)


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
