"""语义建模 Agent Runtime 应用层包装。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Protocol
from uuid import uuid4

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
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
        if not isinstance(raw_output, dict):
            raise _invalid_output("structured_output must be an object")
        message = _required_message(raw_output.get("message"))
        return SemanticModelingChatOutput(
            message=message,
            workbench_state_patch=_optional_dict(raw_output.get("workbench_state_patch")),
            proposal_patch=_optional_dict(raw_output.get("proposal_patch")),
            required_confirmations=_optional_dict_list(
                raw_output.get("required_confirmations"),
                field_name="required_confirmations",
            ),
            suggested_actions=_optional_string_list(raw_output.get("suggested_actions")),
            tool_traces=_tool_traces_or_default(
                raw_output.get("tool_traces"),
                fallback=result.trace,
            ),
        )


def _invalid_output(message: str, *, field_name: str | None = None) -> AgentInferenceRuntimeError:
    details = {"field": field_name} if field_name else {}
    return AgentInferenceRuntimeError(message, code="RUNTIME_INVALID_OUTPUT", details=details)


def _required_message(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _invalid_output(
            "structured_output.message must be a non-empty string",
            field_name="message",
        )
    return value


def _optional_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise _invalid_output("structured output field must be an object")
    return dict(value)


def _tool_traces_or_default(value: Any, *, fallback: Any) -> List[Dict[str, Any]]:
    traces = fallback if value is None else value
    return _dict_list(traces, field_name="tool_traces")


def _optional_dict_list(value: Any, *, field_name: str) -> List[Dict[str, Any]]:
    if value is None:
        return []
    return _dict_list(value, field_name=field_name)


def _dict_list(value: Any, *, field_name: str) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        raise _invalid_output(
            f"structured_output.{field_name} must be a list",
            field_name=field_name,
        )
    if not all(isinstance(item, dict) for item in value):
        raise _invalid_output(
            f"structured_output.{field_name} must contain only objects",
            field_name=field_name,
        )
    return [dict(item) for item in value]


def _optional_string_list(value: Any) -> List[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise _invalid_output(
            "structured_output.suggested_actions must be a list",
            field_name="suggested_actions",
        )
    actions: List[str] = []
    for action in value:
        if not isinstance(action, str):
            raise _invalid_output(
                "structured_output.suggested_actions must contain only strings",
                field_name="suggested_actions",
            )
        normalized = action.strip()
        if normalized:
            actions.append(normalized)
    return actions
