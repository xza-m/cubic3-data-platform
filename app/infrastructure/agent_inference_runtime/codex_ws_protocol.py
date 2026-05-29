"""Codex app-server WebSocket JSON-RPC 协议工具。"""
from __future__ import annotations

import base64
import json
from dataclasses import asdict
from typing import Any

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
)


class CodexWsProtocolError(RuntimeError):
    """Codex app-server WS 协议层错误。"""

    def __init__(
        self,
        message: str,
        *,
        code: str = "RUNTIME_PROVIDER_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


class CodexJsonRpcCodec:
    """最小 JSON-RPC 2.0 request/response codec。"""

    def __init__(self) -> None:
        self._next_id = 1

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        }

    def parse_response(self, raw: str, *, expected_id: int | None = None) -> dict[str, Any] | None:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CodexWsProtocolError(
                "Codex app-server JSON-RPC response 不是合法 JSON。",
                code="RUNTIME_PROVIDER_ERROR",
                details={
                    "raw": raw,
                    "parse_error": str(exc),
                },
            ) from exc

        if not isinstance(payload, dict):
            raise CodexWsProtocolError(
                "Codex app-server JSON-RPC response 不是对象。",
                details={"provider_response": payload},
            )

        if expected_id is not None:
            response_id = payload.get("id")
            if response_id is None and isinstance(payload.get("method"), str):
                return None
            if response_id != expected_id:
                raise CodexWsProtocolError(
                    "Codex app-server JSON-RPC response id 不匹配。",
                    code="RUNTIME_PROVIDER_RESPONSE_ID_MISMATCH",
                    details={
                        "expected_id": expected_id,
                        "response_id": response_id,
                        "response": payload,
                    },
                )

        provider_error = payload.get("error")
        if provider_error is not None:
            provider_code = provider_error.get("code") if isinstance(provider_error, dict) else None
            raise CodexWsProtocolError(
                "Codex app-server JSON-RPC 返回错误。",
                code="RUNTIME_PROVIDER_ERROR",
                details={
                    "provider_code": provider_code,
                    "provider_error": provider_error,
                },
            )

        if "result" not in payload:
            raise CodexWsProtocolError(
                "Codex app-server JSON-RPC response 缺少 result。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"response": payload},
            )

        result = payload.get("result")
        if isinstance(result, dict):
            return dict(result)
        return {"value": result}


def build_initialize_params() -> dict[str, Any]:
    return {
        "clientInfo": {
            "name": "cubic3-data-platform",
            "version": "codex-app-server-ws",
        },
        "capabilities": {
            "experimentalApi": True,
            "requestAttestation": False,
            "optOutNotificationMethods": [],
        },
    }


def build_thread_start_params(
    ref: RuntimeContextRef,
    *,
    project_root: str,
    runtime_workspace_roots: list[str],
) -> dict[str, Any]:
    return {
        "cwd": project_root,
        "runtimeWorkspaceRoots": list(runtime_workspace_roots),
        "approvalPolicy": "never",
        "permissions": "read-only",
        "baseInstructions": _base_instructions(ref),
        "developerInstructions": _developer_instructions(ref),
        "ephemeral": False,
        "sessionStartSource": "startup",
        "experimentalRawEvents": True,
        "persistExtendedHistory": False,
    }


def build_turn_start_params(
    request: AgentInferenceRuntimeRequest,
    *,
    provider_thread_id: str,
) -> dict[str, Any]:
    text = json.dumps(_turn_payload(request), ensure_ascii=False, sort_keys=True)
    return {
        "threadId": provider_thread_id,
        "input": [
            {
                "type": "text",
                "text": text,
                "text_elements": [],
            }
        ],
        "responsesapiClientMetadata": {
            "app_id": request.app_id,
            "action": request.action,
            "principal_id": request.principal_id,
            "project_id": request.runtime_context_ref.project_id,
            "session_id": request.runtime_context_ref.session_id,
            "thread_id": request.runtime_context_ref.thread_id,
            "turn_id": request.runtime_context_ref.turn_id,
            "output_schema": request.output_schema,
        },
    }


def encode_provider_run_id(thread_id: str, turn_id: str) -> str:
    payload = json.dumps(
        {"thread_id": thread_id, "turn_id": turn_id},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_provider_run_id(provider_run_id: str) -> tuple[str, str]:
    padded = provider_run_id + ("=" * (-len(provider_run_id) % 4))
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    return payload["thread_id"], payload["turn_id"]


def map_turn_status(status: str) -> str:
    return {
        "completed": "succeeded",
        "inProgress": "running",
        "failed": "failed",
        "interrupted": "cancelled",
    }.get(status, "failed")


def _base_instructions(ref: RuntimeContextRef) -> str:
    return (
        "你是 Cubic3 数据平台的 Codex app-server runtime worker，"
        f"当前项目为 {ref.project_id}。请基于输入 payload 执行任务并返回结构化结果。"
    )


def _developer_instructions(ref: RuntimeContextRef) -> str:
    return (
        "保持只读执行环境，不进行提交、推送或破坏性操作。"
        f"session={ref.session_id}, thread={ref.thread_id}, turn={ref.turn_id}。"
    )


def _turn_payload(request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
    return {
        "app": request.app_id,
        "action": request.action,
        "principal": request.principal_id,
        "input": dict(request.input),
        "context": dict(request.context_pack),
        "runtime_context": asdict(request.runtime_context_ref),
        "output_schema": request.output_schema,
    }
