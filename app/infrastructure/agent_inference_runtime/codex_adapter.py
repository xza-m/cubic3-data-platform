"""Codex app-server Agent 推理 Runtime 适配器。"""
from __future__ import annotations

from dataclasses import asdict, replace
from typing import Any
from uuid import uuid4

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    AssetRevisionRef,
    RuntimePolicy,
    SemanticRuntimePin,
)
from app.infrastructure.agent_inference_runtime.codex_client import CodexAppServerClient
from app.infrastructure.agent_inference_runtime.codex_workspace import CodexWorkspaceStore


class CodexAppServerRuntimeAdapter:
    """通过 Codex app-server client 协议执行异步 Agent 推理。"""

    runtime_name = "codex_app_server"
    _KNOWN_STATUSES = {"queued", "running", "succeeded", "failed", "cancelled", "timeout"}

    def __init__(
        self,
        *,
        client: CodexAppServerClient,
        workspace_store: CodexWorkspaceStore,
    ) -> None:
        self._client = client
        self._workspace_store = workspace_store

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return (
            request.preferred_runtime in {None, self.runtime_name}
            and request.execution_mode == "async"
        )

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        run_id = f"run_{uuid4().hex}"
        try:
            self._client.healthcheck()
            self._client.capabilities()
            self._client.ensure_thread(request.runtime_context_ref)
            self._workspace_store.prepare_turn(
                request.runtime_context_ref,
                request_payload=_request_payload(request),
                runtime_policy=_runtime_policy_payload(request.runtime_policy),
            )
            provider_run = self._client.submit_run(request)
            status_payload = self._client.poll_run(provider_run.provider_run_id)
            event_page = self._client.stream_events(provider_run.provider_run_id)
            artifacts_payload = self._client.collect_artifacts(provider_run.provider_run_id)
        except AgentInferenceRuntimeError:
            raise
        except Exception as exc:
            raise AgentInferenceRuntimeError(
                "Codex app-server runtime provider 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"runtime_name": self.runtime_name},
            ) from exc

        status = _result_status(status_payload)
        return AgentInferenceRuntimeResult(
            run_id=run_id,
            status=status,
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output=_dict_payload(status_payload.get("structured_output")),
            artifacts=_artifacts(run_id, artifacts_payload),
            usage=_dict_payload(status_payload.get("usage")),
            trace=list(event_page.get("events") or []),
            error=_result_error(status, status_payload),
        )


def _request_payload(request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
    return {
        "app_id": request.app_id,
        "action": request.action,
        "runtime_context_ref": asdict(request.runtime_context_ref),
        "principal_id": request.principal_id,
        "input": dict(request.input),
        "context_pack": dict(request.context_pack),
        "output_schema": request.output_schema,
        "preferred_runtime": request.preferred_runtime,
        "execution_mode": request.execution_mode,
        "semantic_runtime_pin": _optional_dataclass(request.semantic_runtime_pin),
        "asset_revision_refs": [_asset_revision_ref(ref) for ref in request.asset_revision_refs],
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


def _optional_dataclass(value: SemanticRuntimePin | None) -> dict[str, Any] | None:
    if value is None:
        return None
    return asdict(value)


def _asset_revision_ref(value: AssetRevisionRef) -> dict[str, Any]:
    return asdict(value)


def _result_status(status_payload: dict[str, Any]) -> str:
    raw_status = status_payload.get("status")
    if raw_status == "error":
        return "failed"
    if raw_status in CodexAppServerRuntimeAdapter._KNOWN_STATUSES:
        return raw_status
    return "failed"


def _result_error(status: str, status_payload: dict[str, Any]) -> dict[str, Any] | None:
    error = status_payload.get("error")
    if isinstance(error, dict):
        return dict(error)
    if error:
        return {"code": "RUNTIME_PROVIDER_ERROR", "message": str(error)}
    if status == "failed":
        provider_status = status_payload.get("status", "failed")
        return {
            "code": "RUNTIME_PROVIDER_FAILED",
            "message": f"Codex app-server run ended with status={provider_status}",
        }
    return None


def _dict_payload(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    raise AgentInferenceRuntimeError(
        "Codex app-server runtime 返回的结构化字段不是对象。",
        code="RUNTIME_INVALID_OUTPUT",
        details={"runtime_name": CodexAppServerRuntimeAdapter.runtime_name},
    )


def _artifacts(
    run_id: str,
    artifacts_payload: list[dict[str, Any]] | list[AgentInferenceRuntimeArtifact],
) -> list[AgentInferenceRuntimeArtifact]:
    artifacts: list[AgentInferenceRuntimeArtifact] = []
    for raw_artifact in artifacts_payload or []:
        if isinstance(raw_artifact, AgentInferenceRuntimeArtifact):
            artifacts.append(replace(raw_artifact, run_id=run_id))
            continue
        artifact_data = dict(raw_artifact)
        artifact_data["run_id"] = run_id
        artifacts.append(AgentInferenceRuntimeArtifact(**artifact_data))
    return artifacts
