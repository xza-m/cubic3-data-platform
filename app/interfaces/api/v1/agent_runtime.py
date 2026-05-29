from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from functools import wraps
import hashlib
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Callable, Mapping
from urllib.parse import quote

from flask import Blueprint, current_app, g, request, send_file

from app.application.agent_inference_runtime.codex_process_manager import (
    CodexProcessManagerError,
)
from app.application.agent_inference_runtime.codex_run_service import CodexRunNotFoundError
from app.domain.agent_inference_runtime.types import RuntimeProviderConfigUpdate
from app.infrastructure.agent_inference_runtime.codex_client import (
    CodexAppServerClientError,
)

RUNTIME_MANAGE_ROLES = {"platform_admin", "governance_admin", "admin"}

try:
    from app.interfaces.api.middleware.auth import (  # type: ignore[attr-defined]
        _resolve_access_roles,
        require_admin,
        require_identity,
    )
except ImportError:  # pragma: no cover - 兼容旧认证模块名
    from app.interfaces.api.middleware.auth import require_admin, require_auth as require_identity  # type: ignore[no-redef]

    def _resolve_access_roles(principal_id: str | None) -> set[str]:  # type: ignore[no-redef]
        return set()
from app.shared.response import error, success
from app.shared.utils.time import utcnow


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
        expires_at = artifact_payload.get("expires_at")
        download_url = _artifact_download_url(artifact_payload)
        return {
            "artifact_id": artifact_payload.get("artifact_id"),
            "run_id": artifact_payload.get("run_id"),
            "artifact_type": artifact_payload.get("artifact_type"),
            "title": artifact_payload.get("title"),
            "summary": artifact_payload.get("summary"),
            "mime_type": artifact_payload.get("mime_type"),
            "size_bytes": artifact_payload.get("size_bytes"),
            "sha256": artifact_payload.get("sha256"),
            "expires_at": _datetime_payload(expires_at),
            "downloadable": download_url is not None,
            "download_url": download_url,
        }
    download_url = _artifact_download_url(artifact)
    return {
        "artifact_id": _value(artifact, "artifact_id"),
        "run_id": _value(artifact, "run_id"),
        "artifact_type": _value(artifact, "artifact_type"),
        "title": _value(artifact, "title"),
        "summary": _value(artifact, "summary"),
        "mime_type": _value(artifact, "mime_type"),
        "size_bytes": _value(artifact, "size_bytes"),
        "sha256": _value(artifact, "sha256"),
        "expires_at": _datetime_payload(_value(artifact, "expires_at")),
        "downloadable": download_url is not None,
        "download_url": download_url,
    }


def _require_identity_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_identity(func)(*args, **kwargs)

    return wrapper


def _require_admin_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_admin(func)(*args, **kwargs)

    return wrapper


def _principal_id() -> str | None:
    return getattr(g, "principal_id", None) or getattr(g, "user_id", None)


def _can_manage_runtime() -> bool:
    if current_app.config.get("TESTING"):
        testing_roles = set(getattr(g, "user_roles", []) or []) | set(getattr(g, "platform_roles", []) or [])
        if testing_roles:
            return bool(RUNTIME_MANAGE_ROLES & testing_roles)
    return bool(RUNTIME_MANAGE_ROLES & _resolve_access_roles(_principal_id()))


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _invalid_provider_config_payload(field: str):
    return error(
        "Agent runtime provider config payload is invalid",
        status=400,
        details={"code": "RUNTIME_PROVIDER_CONFIG_INVALID", "field": field},
    )


def _not_found():
    return error(
        "Agent runtime run not found",
        status=404,
        details={"code": "RUNTIME_RUN_NOT_FOUND"},
    )


def _artifact_integrity_error():
    return error(
        "Agent runtime artifact integrity check failed",
        status=409,
        details={"code": "RUNTIME_ARTIFACT_INTEGRITY_ERROR"},
    )


def _is_owned_by_current_principal(run: Any, principal_id: str | None) -> bool:
    if not principal_id:
        return False
    return _value(run, "principal_id") == principal_id


def _resolve_repository(repository_provider: Any) -> Any:
    if callable(repository_provider):
        return repository_provider()
    return repository_provider


def create_agent_runtime_blueprint(
    repository_provider: Any,
    runtime_management_provider: Any | None = None,
    codex_run_service_provider: Any | None = None,
) -> Blueprint:
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

    @bp.route("/runs/<run_id>/artifacts/<artifact_id>/download", methods=["GET"])
    @_require_identity_unless_testing
    def download_artifact(run_id: str, artifact_id: str):
        repository = _resolve_repository(repository_provider)
        artifact = repository.get_artifact_for_download(
            run_id=run_id,
            artifact_id=artifact_id,
            principal_id=_principal_id(),
        )
        if artifact is None:
            return _not_found()
        try:
            file_path = _resolve_download_path(
                _value(artifact, "storage_uri"),
                run_id=run_id,
                artifact_id=artifact_id,
                artifact=artifact,
            )
        except ValueError:
            return _artifact_integrity_error()
        if not file_path.is_file():
            return _not_found()
        if not _artifact_file_hash_matches(file_path, _value(artifact, "sha256")):
            return _artifact_integrity_error()
        return send_file(
            file_path,
            mimetype=_value(artifact, "mime_type") or "application/octet-stream",
            as_attachment=True,
            download_name=_safe_download_name(
                _value(artifact, "download_name") or _value(artifact, "title") or artifact_id
            ),
        )

    @bp.route("/runs/<run_id>/poll", methods=["POST"])
    @_require_identity_unless_testing
    def poll_run(run_id: str):
        return _codex_run_operation(
            codex_run_service_provider,
            lambda service: service.poll(run_id, principal_id=_principal_id()),
        )

    @bp.route("/runs/<run_id>/cancel", methods=["POST"])
    @_require_identity_unless_testing
    def cancel_run(run_id: str):
        return _codex_run_operation(
            codex_run_service_provider,
            lambda service: service.cancel(run_id, principal_id=_principal_id()),
        )

    @bp.route("/runs/<run_id>/events", methods=["GET"])
    @_require_identity_unless_testing
    def run_events(run_id: str):
        return _codex_run_operation(
            codex_run_service_provider,
            lambda service: service.read_events(run_id, principal_id=_principal_id()),
        )

    @bp.route("/runs/<run_id>/collect-artifacts", methods=["POST"])
    @_require_identity_unless_testing
    def collect_provider_artifacts(run_id: str):
        return _codex_run_operation(
            codex_run_service_provider,
            lambda service: service.collect_artifacts(run_id, principal_id=_principal_id()),
        )

    @bp.route("/providers/status", methods=["GET"])
    @_require_identity_unless_testing
    def providers_status():
        management = _resolve_runtime_management(runtime_management_provider)
        snapshot = _plain(management.snapshot())
        if isinstance(snapshot, Mapping):
            snapshot_payload = dict(snapshot)
        else:
            snapshot_payload = snapshot
        snapshot_payload["can_manage"] = _can_manage_runtime()
        return success(data=snapshot_payload)

    @bp.route("/actions/<path:action>/binding", methods=["GET"])
    @_require_identity_unless_testing
    def action_binding(action: str):
        management = _resolve_runtime_management(runtime_management_provider)
        return success(data=_plain(management.resolve_action(action)))

    @bp.route("/providers/<runtime_name>/test", methods=["POST"])
    @_require_admin_unless_testing
    def test_provider(runtime_name: str):
        management = _resolve_runtime_management(runtime_management_provider)
        try:
            provider_status = management.test_provider(runtime_name, principal_id=_principal_id())
        except KeyError:
            return error(
                "Agent runtime provider not found",
                status=404,
                details={"code": "RUNTIME_PROVIDER_NOT_FOUND", "runtime_name": runtime_name},
            )
        return success(data=_plain(provider_status))

    @bp.route("/providers/<runtime_name>/config", methods=["GET"])
    @_require_admin_unless_testing
    def provider_config(runtime_name: str):
        management = _resolve_runtime_management(runtime_management_provider)
        try:
            provider_config = management.provider_config(runtime_name)
        except KeyError:
            return error(
                "Agent runtime provider not found",
                status=404,
                details={"code": "RUNTIME_PROVIDER_NOT_FOUND", "runtime_name": runtime_name},
            )
        return success(data=_plain(provider_config))

    @bp.route("/providers/<runtime_name>/config", methods=["PUT"])
    @_require_admin_unless_testing
    def update_provider_config(runtime_name: str):
        management = _resolve_runtime_management(runtime_management_provider)
        raw_body = request.get_data(cache=True)
        parsed_payload = request.get_json(silent=True)
        payload = {} if not raw_body.strip() and parsed_payload is None else parsed_payload
        if not isinstance(payload, Mapping):
            return _invalid_provider_config_payload("body")
        extra_payload = payload.get("extra") or {}
        if not isinstance(extra_payload, Mapping):
            return _invalid_provider_config_payload("extra")
        for field in ("endpoint", "model", "api_key"):
            value = payload.get(field)
            if value is not None and not isinstance(value, str):
                return _invalid_provider_config_payload(field)
        if isinstance(payload.get("api_key"), str) and payload["api_key"].strip():
            return _invalid_provider_config_payload("api_key")
        try:
            provider_config = management.update_provider_config(
                RuntimeProviderConfigUpdate(
                    runtime_name=runtime_name,
                    enabled=_coerce_bool(payload.get("enabled", True)),
                    endpoint=payload.get("endpoint"),
                    model=payload.get("model"),
                    api_key=payload.get("api_key"),
                    extra=dict(extra_payload),
                    updated_by=_principal_id() or "unknown",
                )
            )
        except KeyError:
            return error(
                "Agent runtime provider not found",
                status=404,
                details={"code": "RUNTIME_PROVIDER_NOT_FOUND", "runtime_name": runtime_name},
            )
        return success(data=provider_config.to_public_dict())

    @bp.route("/providers/<runtime_name>/start", methods=["POST"])
    @_require_admin_unless_testing
    def start_provider(runtime_name: str):
        return _runtime_management_operation(
            runtime_management_provider,
            lambda management: management.start_provider(runtime_name, principal_id=_principal_id()),
        )

    @bp.route("/providers/<runtime_name>/stop", methods=["POST"])
    @_require_admin_unless_testing
    def stop_provider(runtime_name: str):
        return _runtime_management_operation(
            runtime_management_provider,
            lambda management: management.stop_provider(runtime_name, principal_id=_principal_id()),
        )

    @bp.route("/providers/<runtime_name>/restart", methods=["POST"])
    @_require_admin_unless_testing
    def restart_provider(runtime_name: str):
        return _runtime_management_operation(
            runtime_management_provider,
            lambda management: management.restart_provider(runtime_name, principal_id=_principal_id()),
        )

    @bp.route("/providers/<runtime_name>/logs", methods=["GET"])
    @_require_admin_unless_testing
    def provider_logs(runtime_name: str):
        return _runtime_management_operation(
            runtime_management_provider,
            lambda management: management.provider_logs(runtime_name),
        )

    @bp.route("/providers/<runtime_name>/capabilities", methods=["GET"])
    @_require_identity_unless_testing
    def provider_capabilities(runtime_name: str):
        return _runtime_management_operation(
            runtime_management_provider,
            lambda management: management.provider_capabilities(runtime_name),
        )

    return bp


def _resolve_runtime_management(runtime_management_provider: Any) -> Any:
    if runtime_management_provider is None:
        raise RuntimeError("agent runtime management service is not configured")
    if callable(runtime_management_provider):
        return runtime_management_provider()
    return runtime_management_provider


def _resolve_codex_run_service(codex_run_service_provider: Any) -> Any:
    if codex_run_service_provider is None:
        raise RuntimeError("codex run service is not configured")
    if callable(codex_run_service_provider):
        return codex_run_service_provider()
    return codex_run_service_provider


def _codex_run_operation(codex_run_service_provider: Any, operation: Callable[[Any], Any]):
    service = _resolve_codex_run_service(codex_run_service_provider)
    try:
        result = operation(service)
    except CodexRunNotFoundError:
        return _not_found()
    except CodexAppServerClientError as exc:
        return error(
            str(exc),
            status=exc.status_code,
            details={"code": exc.code, **exc.details},
        )
    return success(data=_plain(result))


def _runtime_management_operation(runtime_management_provider: Any, operation: Callable[[Any], Any]):
    management = _resolve_runtime_management(runtime_management_provider)
    try:
        result = operation(management)
    except KeyError as exc:
        runtime_name = str(exc.args[0]) if exc.args else ""
        return error(
            "Agent runtime provider not found",
            status=404,
            details={"code": "RUNTIME_PROVIDER_NOT_FOUND", "runtime_name": runtime_name},
        )
    except CodexProcessManagerError as exc:
        return error(
            str(exc),
            status=exc.status_code,
            details={"code": exc.code, **exc.details},
        )
    except CodexAppServerClientError as exc:
        return error(
            str(exc),
            status=exc.status_code,
            details={"code": exc.code, **exc.details},
        )
    return success(data=_plain(result))


def _artifact_download_url(artifact: Any) -> str | None:
    expires_at = _value(artifact, "expires_at")
    run_id = _value(artifact, "run_id")
    artifact_id = _value(artifact, "artifact_id")
    if not run_id or not artifact_id or _is_expired(expires_at):
        return None
    if not _is_download_route_segment(run_id) or not _is_download_route_segment(artifact_id):
        return None
    try:
        _artifact_storage_segments(
            _value(artifact, "storage_uri"),
            run_id=str(run_id),
            artifact_id=str(artifact_id),
            artifact=artifact,
        )
    except ValueError:
        return None
    encoded_run_id = quote(str(run_id), safe="")
    encoded_artifact_id = quote(str(artifact_id), safe="")
    return (
        f"/api/v1/agent-runtime/runs/{encoded_run_id}/artifacts/"
        f"{encoded_artifact_id}/download"
    )


def _datetime_payload(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _is_expired(value: Any) -> bool:
    if value is None:
        return False
    if not isinstance(value, datetime):
        return False
    candidate = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return candidate <= utcnow()


def _is_download_route_segment(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    return "/" not in value and "\\" not in value


def _resolve_download_path(
    storage_uri: Any,
    *,
    run_id: str,
    artifact_id: str,
    artifact: Any,
) -> Path:
    runtime_root = _trusted_runtime_root()
    segments = _artifact_storage_segments(
        storage_uri,
        run_id=run_id,
        artifact_id=artifact_id,
        artifact=artifact,
    )
    candidate = _resolve_runtime_path_without_symlinks(runtime_root, segments)
    if candidate != runtime_root and runtime_root not in candidate.parents:
        raise ValueError("artifact path escapes runtime root")
    return candidate


def _trusted_runtime_root() -> Path:
    raw = (
        os.getenv("AGENT_CODEX_RUNTIME_ROOT")
        or current_app.config.get("AGENT_CODEX_RUNTIME_ROOT")
        or ".cubic3/agent-codex"
    )
    return Path(str(raw)).expanduser().resolve()


def _artifact_storage_segments(
    storage_uri: Any,
    *,
    run_id: str,
    artifact_id: str,
    artifact: Any,
) -> list[str]:
    if not isinstance(storage_uri, str) or not storage_uri.strip():
        raise ValueError("artifact storage uri invalid")
    raw_uri = storage_uri.strip()
    if not raw_uri.startswith("codex-workspace://"):
        raise ValueError("artifact storage uri scheme invalid")
    relative_path = raw_uri.removeprefix("codex-workspace://")
    segments = _safe_storage_relative_segments(relative_path)
    _validate_artifact_namespace(segments, run_id=run_id, artifact_id=artifact_id, artifact=artifact)
    return segments


def _safe_storage_relative_segments(relative_path: str) -> list[str]:
    if (
        not isinstance(relative_path, str)
        or not relative_path
        or Path(relative_path).is_absolute()
        or PurePosixPath(relative_path).is_absolute()
        or PureWindowsPath(relative_path).is_absolute()
    ):
        raise ValueError("artifact storage path invalid")
    normalized = relative_path.replace("\\", "/")
    segments = normalized.split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("artifact storage path invalid")
    return segments


def _resolve_runtime_path_without_symlinks(runtime_root: Path, segments: list[str]) -> Path:
    candidate = runtime_root
    for segment in segments:
        candidate = candidate / segment
        try:
            candidate.lstat()
        except FileNotFoundError:
            return candidate
        if candidate.is_symlink():
            raise ValueError("artifact path contains symlink")
    return candidate.resolve()


def _validate_artifact_namespace(
    segments: list[str],
    *,
    run_id: str,
    artifact_id: str,
    artifact: Any,
) -> None:
    if len(segments) != 13:
        raise ValueError("artifact storage namespace invalid")
    expected_labels = {
        0: "projects",
        2: "sessions",
        4: "threads",
        6: "turns",
        8: "runs",
        10: "artifacts",
    }
    if any(segments[index] != label for index, label in expected_labels.items()):
        raise ValueError("artifact storage namespace invalid")
    if segments[9] != quote(str(run_id), safe="") or segments[11] != quote(
        str(artifact_id), safe=""
    ):
        raise ValueError("artifact storage route mismatch")
    artifact_run_id = _value(artifact, "run_id")
    artifact_artifact_id = _value(artifact, "artifact_id")
    if artifact_run_id is not None and str(artifact_run_id) != str(run_id):
        raise ValueError("artifact storage artifact mismatch")
    if artifact_artifact_id is not None and str(artifact_artifact_id) != str(artifact_id):
        raise ValueError("artifact storage artifact mismatch")

    context_ref = _value(artifact, "context_ref") or _value(artifact, "runtime_context_ref")
    if context_ref is None:
        raise ValueError("artifact storage context missing")
    expected_context = {
        1: _value(context_ref, "project_id"),
        3: _value(context_ref, "session_id"),
        5: _value(context_ref, "thread_id"),
        7: _value(context_ref, "turn_id"),
    }
    for index, expected in expected_context.items():
        if expected is None or segments[index] != quote(str(expected), safe=""):
            raise ValueError("artifact storage context mismatch")


def _artifact_file_hash_matches(path: Path, expected_sha256: Any) -> bool:
    if not isinstance(expected_sha256, str) or not expected_sha256.startswith("sha256:"):
        return False
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return f"sha256:{hasher.hexdigest()}" == expected_sha256


def _safe_download_name(raw_name: Any) -> str:
    fallback = "artifact"
    if not isinstance(raw_name, str) or not raw_name.strip():
        return fallback
    name = raw_name.strip()
    if any(ord(char) < 32 or ord(char) == 127 for char in name):
        return fallback
    if "/" in name or "\\" in name or name in {".", ".."}:
        return fallback
    return name
