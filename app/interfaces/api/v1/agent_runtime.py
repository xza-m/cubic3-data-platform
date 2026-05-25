from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Mapping

from flask import Blueprint

from app.shared.response import error, success


def _value(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _plain(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, Mapping):
        return dict(value)
    return value


def _context_ref_payload(ref: Any) -> dict[str, Any]:
    ref_payload = _plain(ref)
    if isinstance(ref_payload, Mapping):
        return {
            "project_id": ref_payload.get("project_id"),
            "session_id": ref_payload.get("session_id"),
            "thread_id": ref_payload.get("thread_id"),
            "turn_id": ref_payload.get("turn_id"),
        }
    return {
        "project_id": _value(ref, "project_id"),
        "session_id": _value(ref, "session_id"),
        "thread_id": _value(ref, "thread_id"),
        "turn_id": _value(ref, "turn_id"),
    }


def _run_payload(run: Any) -> dict[str, Any]:
    return {
        "run_id": _value(run, "run_id"),
        "app_id": _value(run, "app_id"),
        "action": _value(run, "action"),
        "runtime_name": _value(run, "runtime_name"),
        "status": _value(run, "status"),
        "principal_id": _value(run, "principal_id"),
        "runtime_context_ref": _context_ref_payload(_value(run, "runtime_context_ref")),
        "provider_ref": _plain(_value(run, "provider_ref")),
        "usage": _plain(_value(run, "usage", {})),
        "error": _plain(_value(run, "error")),
    }


def _artifact_payload(artifact: Any) -> dict[str, Any]:
    artifact_payload = _plain(artifact)
    if isinstance(artifact_payload, Mapping):
        return {
            "artifact_id": artifact_payload.get("artifact_id"),
            "run_id": artifact_payload.get("run_id"),
            "artifact_type": artifact_payload.get("artifact_type"),
            "title": artifact_payload.get("title"),
            "summary": artifact_payload.get("summary"),
            "mime_type": artifact_payload.get("mime_type"),
            "size_bytes": artifact_payload.get("size_bytes"),
            "sha256": artifact_payload.get("sha256"),
        }
    return {
        "artifact_id": _value(artifact, "artifact_id"),
        "run_id": _value(artifact, "run_id"),
        "artifact_type": _value(artifact, "artifact_type"),
        "title": _value(artifact, "title"),
        "summary": _value(artifact, "summary"),
        "mime_type": _value(artifact, "mime_type"),
        "size_bytes": _value(artifact, "size_bytes"),
        "sha256": _value(artifact, "sha256"),
    }


def create_agent_runtime_blueprint(repository: Any) -> Blueprint:
    bp = Blueprint("agent_runtime", __name__, url_prefix="/api/v1/agent-runtime")

    @bp.route("/runs/<run_id>", methods=["GET"])
    def get_run(run_id: str):
        run = repository.get_run(run_id)
        if run is None:
            return error(
                "Agent runtime run not found",
                status=404,
                details={"code": "RUNTIME_RUN_NOT_FOUND"},
            )
        return success(data=_run_payload(run))

    @bp.route("/runs/<run_id>/artifacts", methods=["GET"])
    def list_artifacts(run_id: str):
        artifacts = repository.list_artifacts(run_id=run_id, principal_id=None)
        return success(data={"items": [_artifact_payload(item) for item in artifacts]})

    return bp
