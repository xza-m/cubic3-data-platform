"""Codex app-server 异步 run 生命周期服务。"""
from __future__ import annotations

from typing import Any, Mapping
from uuid import uuid4

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeRun,
)
from app.infrastructure.agent_inference_runtime.codex_client import (
    CodexAppServerClientError,
    ProviderRunRef,
)


class CodexRunNotFoundError(KeyError):
    """权限安全的 run not found。

    调用方不区分真实不存在与 owner 不匹配，避免跨用户枚举 run。
    """


class CodexRunService:
    """管理 Codex app-server 异步 run，不承载语义业务逻辑。"""

    runtime_name = "codex_app_server"
    _KNOWN_STATUSES = {"queued", "running", "succeeded", "failed", "cancelled", "timeout"}
    _TERMINAL_STATUSES = {"succeeded", "failed", "cancelled", "timeout"}

    def __init__(
        self,
        *,
        client: Any | None = None,
        client_provider: Any | None = None,
        repository: Any,
        run_id_factory: Any | None = None,
    ) -> None:
        if client is None and client_provider is None:
            raise ValueError("codex run service requires client or client_provider")
        self._client_instance = client
        self._client_provider = client_provider
        self._repository = repository
        self._run_id_factory = run_id_factory or (lambda: f"run_{uuid4().hex}")

    def submit(self, request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
        provider_ref = _provider_run_ref(self._current_client().submit_run(request))
        provider_run_id = _stored_provider_run_id_from_ref(provider_ref)

        run_id = self._run_id_factory()
        run = AgentInferenceRuntimeRun(
            run_id=run_id,
            app_id=request.app_id,
            action=request.action,
            runtime_name=self.runtime_name,
            status="queued",
            runtime_context_ref=request.runtime_context_ref,
            principal_id=request.principal_id,
            provider_ref=provider_ref,
            usage={},
            error=None,
        )
        self._repository.save_run(run)
        return {
            "run_id": run_id,
            "provider_run_id": provider_run_id,
            "status": "queued",
        }

    def poll(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        try:
            provider_run_id = _stored_provider_run_id(run)
            provider_payload = _dict_or_error(self._current_client().poll_run(provider_run_id))
            status = _status(provider_payload, default=run.status)
            usage = _dict_field(provider_payload, "usage")
            error = _status_error(status, provider_payload)
            provider_ref = _merge_provider_ref(run.provider_ref, provider_payload)
        except CodexAppServerClientError as exc:
            status = run.status
            usage = dict(run.usage)
            error = dict(run.error) if run.error is not None else None
            provider_ref = _with_last_poll_error(run.provider_ref, _provider_error(exc))

        updated = AgentInferenceRuntimeRun(
            run_id=run.run_id,
            app_id=run.app_id,
            action=run.action,
            runtime_name=run.runtime_name,
            status=status,
            runtime_context_ref=run.runtime_context_ref,
            principal_id=run.principal_id,
            provider_ref=provider_ref,
            usage=usage,
            error=error,
        )
        self._repository.save_run(updated)
        return _run_lifecycle_payload(updated)

    def cancel(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        if run.status in self._TERMINAL_STATUSES:
            return _run_lifecycle_payload(run)
        try:
            provider_run_id = _stored_provider_run_id(run)
            provider_payload = _dict_or_error(self._current_client().cancel_run(provider_run_id))
            status = _status(provider_payload, default="cancelled")
            if status not in {"cancelled", "failed", "timeout"}:
                status = "cancelled"
            error = _status_error(status, provider_payload)
            provider_ref = _merge_provider_ref(run.provider_ref, provider_payload)
        except (CodexAppServerClientError, ValueError) as exc:
            status = "failed"
            error = _provider_error(exc)
            provider_ref = dict(run.provider_ref or {})
        updated = AgentInferenceRuntimeRun(
            run_id=run.run_id,
            app_id=run.app_id,
            action=run.action,
            runtime_name=run.runtime_name,
            status=status,
            runtime_context_ref=run.runtime_context_ref,
            principal_id=run.principal_id,
            provider_ref=provider_ref,
            usage=dict(run.usage),
            error=error,
        )
        self._repository.save_run(updated)
        return _run_lifecycle_payload(updated)

    def read_events(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        provider_run_id = _stored_provider_run_id(run)
        payload = _dict_or_error(self._current_client().stream_events(provider_run_id))
        items = _list_of_dicts_or_error(payload.get("events"), field="events")
        result = {"run_id": run.run_id, "provider_run_id": provider_run_id, "items": items}
        if "next_cursor" in payload:
            result["next_cursor"] = payload["next_cursor"]
        return result

    def collect_artifacts(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        provider_run_id = _stored_provider_run_id(run)
        items = _list_of_dicts_or_error(
            self._current_client().collect_artifacts(provider_run_id),
            field="artifacts",
        )
        return {"run_id": run.run_id, "provider_run_id": provider_run_id, "items": items}

    def _current_client(self) -> Any:
        if self._client_provider is not None:
            return self._client_provider()
        return self._client_instance

    def _owned_run(self, run_id: str, principal_id: str | None) -> AgentInferenceRuntimeRun:
        run = self._repository.get_run(run_id)
        if run is None:
            raise CodexRunNotFoundError(run_id)
        if principal_id is None or run.principal_id != principal_id:
            raise CodexRunNotFoundError(run_id)
        return run

def _dict_or_error(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    raise _invalid_provider_payload("payload must be a dict")


def _list_of_dicts_or_error(value: Any, *, field: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise _invalid_provider_payload(f"{field} payload must be list[dict]")
    return [dict(item) for item in value]


def _provider_run_id(payload: Mapping[str, Any]) -> str:
    provider_run_id = payload.get("provider_run_id") or payload.get("run_id")
    if not isinstance(provider_run_id, str) or not provider_run_id.strip():
        raise _invalid_provider_payload("provider_run_id is required")
    return provider_run_id


def _stored_provider_run_id(run: AgentInferenceRuntimeRun) -> str:
    provider_ref = run.provider_ref or {}
    return _stored_provider_run_id_from_ref(provider_ref)


def _stored_provider_run_id_from_ref(provider_ref: Mapping[str, Any]) -> str:
    provider_run_id = provider_ref.get("provider_run_id")
    if not isinstance(provider_run_id, str) or not provider_run_id.strip():
        raise _invalid_provider_payload("stored provider_run_id is missing")
    return provider_run_id


def _provider_run_ref(ref: Any) -> dict[str, Any]:
    if isinstance(ref, ProviderRunRef):
        provider_ref: dict[str, Any] = {"provider_run_id": ref.provider_run_id}
        if ref.provider:
            provider_ref["provider"] = ref.provider
        if ref.provider_thread_id:
            provider_ref["provider_thread_id"] = ref.provider_thread_id
        return provider_ref
    if isinstance(ref, Mapping):
        provider_ref = {}
        provider_run_id = _provider_run_id(ref)
        provider_ref["provider_run_id"] = provider_run_id
        for key in ("provider", "provider_thread_id"):
            value = ref.get(key)
            if isinstance(value, str) and value:
                provider_ref[key] = value
        return provider_ref
    raise _invalid_provider_payload("ProviderRunRef is required")


def _status(payload: Mapping[str, Any], *, default: str) -> str:
    raw_status = payload.get("status", default)
    if raw_status == "error":
        return "failed"
    if raw_status in CodexRunService._KNOWN_STATUSES:
        return str(raw_status)
    raise _invalid_provider_payload(f"unknown status: {raw_status}")


def _dict_field(payload: Mapping[str, Any], field: str) -> dict[str, Any]:
    value = payload.get(field)
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    raise _invalid_provider_payload(f"{field} must be a dict")


def _invalid_provider_payload(message: str) -> CodexAppServerClientError:
    return CodexAppServerClientError(
        "Codex app-server provider 返回非法 payload。",
        code="RUNTIME_PROVIDER_RESPONSE_INVALID",
        details={"reason": message},
    )


def _status_error(status: str, payload: Mapping[str, Any]) -> dict[str, Any] | None:
    raw_error = payload.get("error")
    if isinstance(raw_error, dict):
        return dict(raw_error)
    if raw_error:
        return {"code": "RUNTIME_PROVIDER_ERROR", "message": str(raw_error)}
    if status == "failed":
        return {
            "code": "RUNTIME_PROVIDER_FAILED",
            "message": f"Codex app-server run ended with status={payload.get('status', status)}",
        }
    return None


def _provider_error(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, CodexAppServerClientError):
        return {"code": exc.code, "message": str(exc), **dict(exc.details)}
    return {
        "code": "RUNTIME_PROVIDER_RESPONSE_INVALID",
        "message": str(exc),
    }


def _with_last_poll_error(
    provider_ref: Mapping[str, Any] | None,
    poll_error: Mapping[str, Any],
) -> dict[str, Any]:
    merged = dict(provider_ref or {})
    merged["last_poll_error"] = dict(poll_error)
    return merged


def _merge_provider_ref(
    provider_ref: Mapping[str, Any] | None,
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    merged = dict(provider_ref or {})
    provider_run_id = payload.get("provider_run_id") or payload.get("run_id")
    if isinstance(provider_run_id, str) and provider_run_id:
        merged["provider_run_id"] = provider_run_id
    for key in (
        "provider",
        "provider_thread_id",
        "provider_turn_id",
        "provider_status",
        "status",
        "result",
        "structured_output",
        "summary",
    ):
        if key in payload and payload[key] is not None:
            merged[key] = payload[key]
    return merged


def _run_lifecycle_payload(run: AgentInferenceRuntimeRun) -> dict[str, Any]:
    provider_ref = dict(run.provider_ref or {})
    return {
        "run_id": run.run_id,
        "provider_run_id": provider_ref.get("provider_run_id"),
        "status": run.status,
        "provider_ref": provider_ref,
        "usage": dict(run.usage),
        "error": dict(run.error) if run.error is not None else None,
    }
