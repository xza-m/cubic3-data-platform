from __future__ import annotations

from dataclasses import asdict, is_dataclass
from functools import wraps
from typing import Any, Callable, Mapping

from flask import Blueprint, current_app, g

try:
    from app.interfaces.api.middleware.auth import require_identity  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - 兼容旧认证模块名
    from app.interfaces.api.middleware.auth import require_auth as require_identity  # type: ignore[no-redef]
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


def _require_identity_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_identity(func)(*args, **kwargs)

    return wrapper


def _principal_id() -> str | None:
    return getattr(g, "principal_id", None) or getattr(g, "user_id", None)


def _not_found():
    return error(
        "Agent runtime run not found",
        status=404,
        details={"code": "RUNTIME_RUN_NOT_FOUND"},
    )


def _is_owned_by_current_principal(run: Any, principal_id: str | None) -> bool:
    return _value(run, "principal_id") == principal_id


def _resolve_repository(repository_provider: Any) -> Any:
    if callable(repository_provider):
        return repository_provider()
    return repository_provider


def create_agent_runtime_blueprint(repository_provider: Any) -> Blueprint:
    bp = Blueprint("agent_runtime", __name__, url_prefix="/api/v1/agent-runtime")

    @bp.route("/runs/<run_id>", methods=["GET"])
    @_require_identity_unless_testing
    def get_run(run_id: str):
        repository = _resolve_repository(repository_provider)
        principal_id = _principal_id()
        run = repository.get_run(run_id)
        if run is None or not _is_owned_by_current_principal(run, principal_id):
            return _not_found()
        return success(data=_run_payload(run))

    @bp.route("/runs/<run_id>/artifacts", methods=["GET"])
    @_require_identity_unless_testing
    def list_artifacts(run_id: str):
        repository = _resolve_repository(repository_provider)
        principal_id = _principal_id()
        run = repository.get_run(run_id)
        if run is None or not _is_owned_by_current_principal(run, principal_id):
            return _not_found()
        artifacts = repository.list_artifacts(run_id=run_id, principal_id=principal_id)
        return success(data={"items": [_artifact_payload(item) for item in artifacts]})

    return bp
