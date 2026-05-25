"""Codex app-server runtime 本地 workspace 契约。"""
from __future__ import annotations

import json
import re
from pathlib import Path
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
        target = (artifact_root / relative_path).resolve()
        if target != artifact_root and artifact_root not in target.parents:
            raise ValueError("artifact path escapes runtime root")
        return target

    def _turn_dir(self, ref: RuntimeContextRef) -> Path:
        project_id = _safe_path_segment(ref.project_id)
        session_id = _safe_path_segment(ref.session_id)
        thread_id = _safe_path_segment(ref.thread_id)
        turn_id = _safe_path_segment(ref.turn_id)
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
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(path)


def _safe_path_segment(value: str) -> str:
    segment = str(value)
    if (
        not segment
        or segment in {".", ".."}
        or "/" in segment
        or "\\" in segment
        or not _SAFE_SEGMENT_PATTERN.fullmatch(segment)
    ):
        raise ValueError("runtime path segment invalid")
    return segment
