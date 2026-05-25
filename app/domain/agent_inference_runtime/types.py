"""平台级 Agent 推理 Runtime 契约。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Mapping, Optional

RuntimeName = Literal["openai_agents_sdk", "openai_compatible", "codex_app_server", "fake"]
ExecutionMode = Literal["sync", "async"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled", "timeout"]


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
    provider_ref: Optional[Mapping[str, str]]
    usage: Dict[str, Any] = field(default_factory=dict)
    error: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class RuntimeSelection:
    runtime_name: RuntimeName
    reason: str
