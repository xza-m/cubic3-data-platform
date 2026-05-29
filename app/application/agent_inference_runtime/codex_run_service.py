"""Codex app-server 异步 run 生命周期服务。"""
from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Mapping
from uuid import uuid4

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeRun,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_http_client import (
    CodexAppServerClientError,
)


class CodexRunNotFoundError(KeyError):
    """权限安全的 run not found。

    调用方不区分真实不存在与 owner 不匹配，避免跨用户枚举 run。
    """


class CodexRunService:
    """管理 Codex app-server 异步 run，不承载语义业务逻辑。"""

    runtime_name = "codex_app_server"
    _KNOWN_STATUSES = {"queued", "running", "succeeded", "failed", "cancelled", "timeout"}

    def __init__(
        self,
        *,
        client: Any,
        repository: Any,
        run_id_factory: Any | None = None,
    ) -> None:
        self._client = client
        self._repository = repository
        self._run_id_factory = run_id_factory or (lambda: f"run_{uuid4().hex}")

    def submit(self, request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
        payload = _request_payload(request)
        provider_payload = self._client.submit_run(payload)
        provider_payload = _dict_or_error(provider_payload)
        provider_run_id = _provider_run_id(provider_payload)
        status = _status(provider_payload, default="queued")

        run_id = self._run_id_factory()
        run = AgentInferenceRuntimeRun(
            run_id=run_id,
            app_id=request.app_id,
            action=request.action,
            runtime_name=self.runtime_name,
            status=status,
            runtime_context_ref=request.runtime_context_ref,
            principal_id=request.principal_id,
            provider_ref={"provider_run_id": provider_run_id},
            usage={},
            error=_status_error(status, provider_payload),
        )
        self._repository.save_run(run)
        return {
            "run_id": run_id,
            "provider_run_id": provider_run_id,
            "status": status,
        }

    def poll(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        provider_run_id = _stored_provider_run_id(run)
        try:
            provider_payload = _dict_or_error(self._client.poll_run(provider_run_id))
            status = _status(provider_payload, default=run.status)
            usage = _dict_field(provider_payload, "usage")
            error = _status_error(status, provider_payload)
            provider_ref = _merge_provider_ref(run.provider_ref, provider_payload)
        except (CodexAppServerClientError, ValueError) as exc:
            status = "failed"
            usage = dict(run.usage)
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
            usage=usage,
            error=error,
        )
        self._repository.save_run(updated)
        return _run_lifecycle_payload(updated)

    def cancel(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        provider_run_id = _stored_provider_run_id(run)
        try:
            provider_payload = _dict_or_error(self._client.cancel_run(provider_run_id))
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
        items = _list_of_dicts_or_error(self._client.events(provider_run_id), field="events")
        return {"run_id": run.run_id, "provider_run_id": provider_run_id, "items": items}

    def collect_artifacts(self, run_id: str, principal_id: str | None = None) -> dict[str, Any]:
        run = self._owned_run(run_id, principal_id)
        provider_run_id = _stored_provider_run_id(run)
        items = _list_of_dicts_or_error(self._client.artifacts(provider_run_id), field="artifacts")
        return {"run_id": run.run_id, "provider_run_id": provider_run_id, "items": items}

    def _owned_run(self, run_id: str, principal_id: str | None) -> AgentInferenceRuntimeRun:
        run = self._repository.get_run(run_id)
        if run is None:
            raise CodexRunNotFoundError(run_id)
        if principal_id is None or run.principal_id != principal_id:
            raise CodexRunNotFoundError(run_id)
        return run


def _request_payload(request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
    return {
        "app_id": request.app_id,
        "action": request.action,
        "runtime_context_ref": asdict(request.runtime_context_ref),
        "principal_id": request.principal_id,
        "input": dict(request.input),
        "context_pack": dict(request.context_pack),
        "output_schema": request.output_schema,
        "runtime_policy": _runtime_policy_payload(request.runtime_policy),
        "preferred_runtime": request.preferred_runtime,
        "execution_mode": request.execution_mode,
        "semantic_runtime_pin": _plain_dataclass(request.semantic_runtime_pin),
        "asset_revision_refs": [_plain_dataclass(ref) for ref in request.asset_revision_refs],
    }


def _runtime_policy_payload(policy: RuntimePolicy) -> dict[str, Any]:
    return {
        "max_runtime_seconds": policy.max_runtime_seconds,
        "max_output_bytes": policy.max_output_bytes,
        "allow_network": policy.allow_network,
        "allowed_tools": list(policy.allowed_tools),
        "command_policy": dict(policy.command_policy),
        "fallback_runtime": policy.fallback_runtime,
    }


def _plain_dataclass(value: Any) -> Any:
    if value is None:
        return None
    if is_dataclass(value):
        return asdict(value)
    return value


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
    provider_run_id = provider_ref.get("provider_run_id")
    if not isinstance(provider_run_id, str) or not provider_run_id.strip():
        raise ValueError("stored provider_run_id is missing")
    return provider_run_id


def _status(payload: Mapping[str, Any], *, default: str) -> str:
    raw_status = payload.get("status", default)
    if raw_status == "error":
        return "failed"
    if raw_status in CodexRunService._KNOWN_STATUSES:
        return str(raw_status)
    return "failed"


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


def _merge_provider_ref(
    provider_ref: Mapping[str, Any] | None,
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    merged = dict(provider_ref or {})
    provider_run_id = payload.get("provider_run_id") or payload.get("run_id")
    if isinstance(provider_run_id, str) and provider_run_id:
        merged["provider_run_id"] = provider_run_id
    for key in ("status", "result", "structured_output", "summary"):
        if key in payload:
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
