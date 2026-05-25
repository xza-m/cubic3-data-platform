"""Codex app-server runtime 本地 workspace 契约。"""
from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Dict

from app.domain.agent_inference_runtime.types import RuntimeContextRef

_SAFE_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


class CodexWorkspaceStore:
    """按 project/session/thread/turn 管理 Codex runtime 本地工作区。"""

    def __init__(self, *, runtime_root: str | Path):
        self._runtime_root = Path(runtime_root).resolve()

    def prepare_turn(
        self,
        ref: RuntimeContextRef,
        *,
        request_payload: Dict[str, Any],
        runtime_policy: Dict[str, Any],
    ) -> Path:
        turn_dir = self._turn_dir(ref)
        (turn_dir / "artifacts").mkdir(parents=True, exist_ok=True)
        self._write_json(turn_dir / "request.json", request_payload)
        self._write_json(turn_dir / "runtime_policy.json", runtime_policy)
        self._write_json(
            turn_dir / "turn_ref.json",
            {
                "project_id": ref.project_id,
                "session_id": ref.session_id,
                "thread_id": ref.thread_id,
                "turn_id": ref.turn_id,
            },
        )
        return turn_dir

    def resolve_artifact_path(self, ref: RuntimeContextRef, relative_path: str) -> Path:
        artifact_root = (self._turn_dir(ref) / "artifacts").resolve()
        safe_relative_path = _safe_artifact_relative_path(relative_path)
        target = (artifact_root / safe_relative_path).resolve()
        if target != artifact_root and artifact_root not in target.parents:
            raise ValueError("artifact path escapes runtime root")
        return target

    def _turn_dir(self, ref: RuntimeContextRef) -> Path:
        project_id = _safe_path_segment("project_id", ref.project_id)
        session_id = _safe_path_segment("session_id", ref.session_id)
        thread_id = _safe_path_segment("thread_id", ref.thread_id)
        turn_id = _safe_path_segment("turn_id", ref.turn_id)
        turn_dir = (
            self._runtime_root
            / "projects"
            / project_id
            / "sessions"
            / session_id
            / "threads"
            / thread_id
            / "turns"
            / turn_id
        ).resolve()
        if turn_dir != self._runtime_root and self._runtime_root not in turn_dir.parents:
            raise ValueError("runtime path escapes runtime root")
        return turn_dir

    @staticmethod
    def _write_json(path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                delete=False,
                dir=path.parent,
                encoding="utf-8",
                prefix=f".{path.name}.",
                suffix=".tmp",
            ) as tmp_file:
                tmp_path = Path(tmp_file.name)
                try:
                    json.dump(payload, tmp_file, ensure_ascii=False, indent=2)
                    tmp_file.write("\n")
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"failed to serialize JSON for {path}") from exc
                tmp_file.flush()
                os.fsync(tmp_file.fileno())
            os.replace(tmp_path, path)
            _fsync_directory(path.parent)
        except Exception:
            if tmp_path is not None and tmp_path.exists():
                tmp_path.unlink()
            raise


def _safe_path_segment(field_name: str, value: object) -> str:
    if not isinstance(value, str):
        raise ValueError(f"runtime path segment invalid: {field_name}")
    segment = value
    if (
        not segment
        or segment in {".", ".."}
        or "/" in segment
        or "\\" in segment
        or not _SAFE_SEGMENT_PATTERN.fullmatch(segment)
    ):
        raise ValueError(f"runtime path segment invalid: {field_name}")
    return segment


def _safe_artifact_relative_path(relative_path: str) -> Path:
    if not isinstance(relative_path, str):
        raise ValueError("artifact path segment invalid")
    if (
        Path(relative_path).is_absolute()
        or PurePosixPath(relative_path).is_absolute()
        or PureWindowsPath(relative_path).is_absolute()
    ):
        raise ValueError("artifact path absolute path is not allowed")
    normalized = relative_path.replace("\\", "/")
    segments = normalized.split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("artifact path segment invalid")
    return Path(*segments)


def _fsync_directory(path: Path) -> None:
    directory_fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
