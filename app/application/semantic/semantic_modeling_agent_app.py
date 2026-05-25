"""语义建模 Agent Runtime 应用层包装。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Protocol
from uuid import uuid4

from app.application.semantic.semantic_evidence_builder import SemanticEvidenceBuilder
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.domain.semantic.modeling_agent_session import AgentSession


class _AgentRuntime(Protocol):
    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        ...


class _EvidenceBuilder(Protocol):
    def build(
        self,
        *,
        session: AgentSession,
        user_message: str,
        request_payload: Mapping[str, Any] | None,
    ) -> Mapping[str, Any]:
        ...


@dataclass(frozen=True)
class SemanticModelingChatOutput:
    message: str = ""
    workbench_state_patch: Dict[str, Any] = field(default_factory=dict)
    proposal_patch: Dict[str, Any] = field(default_factory=dict)
    required_confirmations: List[Any] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)
    tool_traces: List[Dict[str, Any]] = field(default_factory=list)


class SemanticModelingAgentApp:
    """面向语义建模 Chat 动作的薄应用层。"""

    def __init__(
        self,
        *,
        runtime: _AgentRuntime,
        evidence_builder: _EvidenceBuilder | None = None,
    ):
        self._runtime = runtime
        self._evidence_builder = evidence_builder or SemanticEvidenceBuilder()

    def run_chat(
        self,
        *,
        session: AgentSession,
        user_message: str,
        request_payload: Mapping[str, Any] | None = None,
    ) -> SemanticModelingChatOutput:
        context_pack = self._evidence_builder.build(
            session=session,
            user_message=user_message,
            request_payload=request_payload,
        )
        request = AgentInferenceRuntimeRequest(
            app_id="semantic_modeling",
            action="semantic.modeling.chat",
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id=session.id,
                thread_id=session.id,
                turn_id=f"turn_{uuid4().hex}",
            ),
            principal_id=session.principal_id,
            input={
                "message": user_message,
                "user_goal": session.user_goal,
            },
            context_pack=context_pack,
            output_schema="semantic.modeling.chat.output.v1",
            runtime_policy=RuntimePolicy(max_runtime_seconds=60),
            preferred_runtime=None,
            execution_mode="sync",
            semantic_runtime_pin=None,
            asset_revision_refs=[],
        )
        result = self._runtime.invoke(request)
        return self._to_chat_output(result)

    def _to_chat_output(self, result: AgentInferenceRuntimeResult) -> SemanticModelingChatOutput:
        raw_output = result.structured_output
        structured_output = raw_output if isinstance(raw_output, dict) else {}
        return SemanticModelingChatOutput(
            message=_string_or_default(structured_output.get("message")),
            workbench_state_patch=_dict_or_default(
                structured_output.get("workbench_state_patch")
            ),
            proposal_patch=_dict_or_default(structured_output.get("proposal_patch")),
            required_confirmations=_list_or_default(
                structured_output.get("required_confirmations")
            ),
            suggested_actions=[
                str(action)
                for action in _list_or_default(structured_output.get("suggested_actions"))
            ],
            tool_traces=_tool_traces_or_default(
                structured_output.get("tool_traces"),
                fallback=result.trace,
            ),
        )


def _string_or_default(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _dict_or_default(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list_or_default(value: Any) -> List[Any]:
    return list(value) if isinstance(value, list) else []


def _tool_traces_or_default(value: Any, *, fallback: Any) -> List[Dict[str, Any]]:
    traces = value if isinstance(value, list) else fallback
    if not isinstance(traces, list):
        return []
    return [item for item in traces if isinstance(item, dict)]
