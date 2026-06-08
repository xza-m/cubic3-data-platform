"""Agent 推理 Runtime 端口。"""
from __future__ import annotations

from typing import Protocol

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    RuntimeManagementAuditEvent,
    RuntimeName,
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
)


class AgentInferenceRuntimePort(Protocol):
    runtime_name: str

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        ...

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        ...


class RuntimeConfigRepositoryPort(Protocol):
    def get_provider_config(
        self,
        runtime_name: RuntimeName,
    ) -> RuntimeProviderConfigSnapshot | None:
        ...

    def upsert_provider_config(
        self,
        update: RuntimeProviderConfigUpdate,
    ) -> RuntimeProviderConfigSnapshot:
        ...

    def record_audit_event(
        self,
        *,
        runtime_name: RuntimeName,
        action: str,
        principal_id: str | None,
        status: str,
        metadata: dict,
    ) -> RuntimeManagementAuditEvent:
        ...

    def get_latest_audit_event(
        self,
        runtime_name: RuntimeName,
        *,
        action: str | None = None,
    ) -> RuntimeManagementAuditEvent | None:
        ...
