"""平台级 Agent 推理 Runtime 契约。"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Literal, Mapping, Optional

RuntimeName = Literal["openai_agents_sdk", "openai_compatible", "codex_sdk", "fake"]
ExecutionMode = Literal["sync", "async"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled", "timeout"]
RuntimeProviderStatusName = Literal["ready", "disabled", "missing_config", "not_verified", "unavailable"]
RuntimeOperationStatus = Literal["succeeded", "blocked", "failed"]


@dataclass(frozen=True)
class RuntimeContextRef:
    project_id: str
    session_id: str
    thread_id: str
    turn_id: str


@dataclass(frozen=True)
class SemanticRuntimePin:
    snapshot_id: str
    release_id: str
    namespace: str = "default"


@dataclass(frozen=True)
class AssetRevisionRef:
    asset_id: str
    revision_id: str
    asset_type: str
    asset_key: str


@dataclass(frozen=True)
class RuntimePolicy:
    max_runtime_seconds: int = 60
    max_output_bytes: int = 262144
    allow_network: bool = False
    allowed_tools: List[str] = field(default_factory=list)
    command_policy: Dict[str, Any] = field(default_factory=dict)
    fallback_runtime: Optional[RuntimeName] = None


@dataclass(frozen=True)
class AgentInferenceRuntimeRequest:
    app_id: str
    action: str
    runtime_context_ref: RuntimeContextRef
    principal_id: Optional[str]
    input: Mapping[str, Any]
    context_pack: Mapping[str, Any]
    output_schema: str
    runtime_policy: RuntimePolicy
    preferred_runtime: Optional[RuntimeName]
    execution_mode: ExecutionMode
    semantic_runtime_pin: Optional[SemanticRuntimePin]
    asset_revision_refs: List[AssetRevisionRef]


@dataclass(frozen=True)
class AgentInferenceRuntimeArtifact:
    artifact_id: str
    run_id: str
    artifact_type: str
    title: str
    summary: str
    mime_type: str
    size_bytes: int
    sha256: str
    runtime_context_ref: Optional[RuntimeContextRef] = None
    storage_uri: Optional[str] = None
    expires_at: Optional[datetime] = None
    download_name: Optional[str] = None


@dataclass(frozen=True)
class AgentInferenceRuntimeResult:
    run_id: str
    status: RunStatus
    runtime_name: str
    action: str
    structured_output: Dict[str, Any]
    artifacts: List[AgentInferenceRuntimeArtifact]
    usage: Dict[str, Any]
    trace: List[Dict[str, Any]]
    error: Optional[Dict[str, Any]]


@dataclass(frozen=True)
class AgentInferenceRuntimeRun:
    run_id: str
    app_id: str
    action: str
    runtime_name: str
    status: RunStatus
    runtime_context_ref: RuntimeContextRef
    principal_id: Optional[str]
    provider_ref: Optional[Mapping[str, Any]]
    usage: Dict[str, Any] = field(default_factory=dict)
    error: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class RuntimeSelection:
    runtime_name: RuntimeName
    reason: str


@dataclass(frozen=True)
class RuntimeActionBinding:
    action: str
    default_runtime: RuntimeName
    allowed_runtimes: List[RuntimeName]
    expose_selector: bool
    requires_connection: bool
    reason: str
    kind: ExecutionMode = "sync"


@dataclass(frozen=True)
class RuntimeProviderStatus:
    runtime_name: RuntimeName
    label: str
    configured: bool
    available: bool
    status: RuntimeProviderStatusName
    message: str
    operations: List[str]
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RuntimeManagementSnapshot:
    providers: List[RuntimeProviderStatus]
    action_bindings: List[RuntimeActionBinding]


@dataclass(frozen=True)
class RuntimeOperationResult:
    runtime_name: RuntimeName
    operation: str
    status: RuntimeOperationStatus
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RuntimeProviderLogView:
    runtime_name: RuntimeName
    log_path: str
    lines: List[str]
    truncated: bool


@dataclass(frozen=True)
class RuntimeProviderCapabilities:
    runtime_name: RuntimeName
    available: bool
    actions: List[str]
    artifacts: List[str]
    events: List[str]
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RuntimeProviderConfigUpdate:
    runtime_name: RuntimeName
    enabled: bool
    endpoint: str | None
    model: str | None
    api_key: str | None
    extra: dict[str, Any]
    updated_by: str


@dataclass(frozen=True)
class RuntimeProviderConfigSnapshot:
    runtime_name: RuntimeName
    enabled: bool
    endpoint: str | None
    model: str | None
    secret_ref: str | None
    extra: dict[str, Any]
    updated_by: str | None
    updated_at: datetime | None
    secret_ciphertext: str | None = None

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "runtime_name": self.runtime_name,
            "enabled": self.enabled,
            "endpoint": self.endpoint,
            "model": self.model,
            "api_key": "********" if self.secret_ref else None,
            "extra": _mask_sensitive_values(self.extra),
            "updated_by": self.updated_by,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


@dataclass(frozen=True)
class RuntimeManagementAuditEvent:
    id: int | None
    runtime_name: RuntimeName
    action: str
    principal_id: str | None
    status: str
    metadata: dict[str, Any]
    created_at: datetime | None


_SENSITIVE_KEY_PARTS = (
    "api_key",
    "authorization",
    "credential",
    "password",
    "secret",
    "token",
    "key",
)


def _mask_sensitive_values(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            key: "********" if _is_sensitive_key(str(key)) else _mask_sensitive_values(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_mask_sensitive_values(item) for item in value]
    if isinstance(value, tuple):
        return [_mask_sensitive_values(item) for item in value]
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)
