from __future__ import annotations

from dataclasses import asdict, is_dataclass
from functools import wraps
from typing import Any, Callable, Mapping

from flask import Blueprint, current_app, g, request

from app.application.agent_inference_runtime.codex_process_manager import (
    CodexProcessManagerError,
)
from app.domain.agent_inference_runtime.types import RuntimeProviderConfigUpdate

try:
    from app.interfaces.api.middleware.auth import require_admin, require_identity  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - 兼容旧认证模块名
    from app.interfaces.api.middleware.auth import require_admin, require_auth as require_identity  # type: ignore[no-redef]
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


def _require_admin_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_admin(func)(*args, **kwargs)

    return wrapper


def _principal_id() -> str | None:
    return getattr(g, "principal_id", None) or getattr(g, "user_id", None)


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

    @bp.route("/providers/status", methods=["GET"])
    @_require_identity_unless_testing
    def providers_status():
        management = _resolve_runtime_management(runtime_management_provider)
        return success(data=_plain(management.snapshot()))

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
    @_require_identity_unless_testing
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
    return success(data=_plain(result))
