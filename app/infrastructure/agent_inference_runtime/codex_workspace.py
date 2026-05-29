"""Codex app-server runtime 本地 workspace 契约。"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Dict

from app.domain.agent_inference_runtime.types import RuntimeContextRef

_SAFE_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


@dataclass(frozen=True)
class StoredCodexArtifact:
    path: Path
    storage_uri: str
    filename: str
    size_bytes: int
    sha256: str


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

    def write_artifact(
        self,
        ref: RuntimeContextRef,
        *,
        run_id: str,
        artifact_id: str,
        filename: str,
        content: bytes,
    ) -> StoredCodexArtifact:
        if not isinstance(content, (bytes, bytearray, memoryview)):
            raise ValueError("artifact content must be bytes")
        run_segment = _safe_artifact_segment("run_id", run_id)
        artifact_segment = _safe_artifact_segment("artifact_id", artifact_id)
        filename_segment = _safe_artifact_filename(filename)
        artifact_root = self._run_artifact_root_path(ref, run_segment)
        artifact_dir = artifact_root / artifact_segment
        target = artifact_dir / filename_segment
        self._reject_symlink_in_runtime_path(target)
        artifact_dir.mkdir(parents=True, exist_ok=True)
        self._reject_symlink_in_runtime_path(target)
        self._assert_path_inside_runtime_root(artifact_dir, "artifact path escapes runtime root")
        self._assert_path_inside_runtime_root(target, "artifact path escapes runtime root")

        payload = bytes(content)
        tmp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "wb",
                delete=False,
                dir=artifact_dir,
                prefix=f".{filename_segment}.",
                suffix=".tmp",
            ) as tmp_file:
                tmp_path = Path(tmp_file.name)
                tmp_file.write(payload)
                tmp_file.flush()
                os.fsync(tmp_file.fileno())
            os.replace(tmp_path, target)
            _fsync_directory(artifact_dir)
        except Exception:
            if tmp_path is not None and tmp_path.exists():
                tmp_path.unlink()
            raise

        stored_path = target.resolve()
        relative_path = stored_path.relative_to(self._runtime_root)
        return StoredCodexArtifact(
            path=stored_path,
            storage_uri=f"codex-workspace://{relative_path.as_posix()}",
            filename=filename_segment,
            size_bytes=len(payload),
            sha256=f"sha256:{hashlib.sha256(payload).hexdigest()}",
        )

    def _turn_dir(self, ref: RuntimeContextRef) -> Path:
        turn_dir = self._turn_dir_path(ref).resolve()
        if turn_dir != self._runtime_root and self._runtime_root not in turn_dir.parents:
            raise ValueError("runtime path escapes runtime root")
        return turn_dir

    def _turn_dir_path(self, ref: RuntimeContextRef) -> Path:
        project_id = _safe_path_segment("project_id", ref.project_id)
        session_id = _safe_path_segment("session_id", ref.session_id)
        thread_id = _safe_path_segment("thread_id", ref.thread_id)
        turn_id = _safe_path_segment("turn_id", ref.turn_id)
        return (
            self._runtime_root
            / "projects"
            / project_id
            / "sessions"
            / session_id
            / "threads"
            / thread_id
            / "turns"
            / turn_id
        )

    def _run_artifact_root_path(self, ref: RuntimeContextRef, run_id: str) -> Path:
        artifact_root = self._turn_dir_path(ref) / "runs" / run_id / "artifacts"
        self._assert_path_inside_runtime_root(
            artifact_root,
            "artifact path escapes runtime root",
        )
        return artifact_root

    def _reject_symlink_in_runtime_path(self, path: Path) -> None:
        try:
            relative_path = path.relative_to(self._runtime_root)
        except ValueError as exc:
            raise ValueError("artifact path escapes runtime root") from exc
        current = self._runtime_root
        for segment in relative_path.parts:
            current = current / segment
            if current.is_symlink():
                raise ValueError("artifact path symlink is not allowed")

    def _assert_path_inside_runtime_root(self, path: Path, message: str) -> None:
        resolved_path = path.resolve()
        if (
            resolved_path != self._runtime_root
            and self._runtime_root not in resolved_path.parents
        ):
            raise ValueError(message)

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


def _safe_artifact_filename(filename: str) -> str:
    if not isinstance(filename, str):
        raise ValueError("artifact path segment invalid")
    if (
        Path(filename).is_absolute()
        or PurePosixPath(filename).is_absolute()
        or PureWindowsPath(filename).is_absolute()
    ):
        raise ValueError("artifact path absolute path is not allowed")
    if "/" in filename or "\\" in filename:
        raise ValueError("artifact path segment invalid")
    return _safe_artifact_segment("artifact filename", filename)


def _safe_artifact_segment(field_name: str, value: object) -> str:
    try:
        return _safe_path_segment(field_name, value)
    except ValueError as exc:
        raise ValueError("artifact path segment invalid") from exc


def _fsync_directory(path: Path) -> None:
    directory_fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
