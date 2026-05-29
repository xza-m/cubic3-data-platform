"""语义建模 Agent Runtime 应用层包装。"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Protocol
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


class _CodexRunService(Protocol):
    def submit(self, request: AgentInferenceRuntimeRequest) -> Dict[str, Any]:
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
    required_confirmations: List[Dict[str, Any]] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)
    tool_traces: List[Dict[str, Any]] = field(default_factory=list)


class SemanticModelingAgentApp:
    """面向语义建模 Chat 动作的薄应用层。"""

    def __init__(
        self,
        *,
        runtime: _AgentRuntime,
        run_service: _CodexRunService | Callable[[], _CodexRunService] | None = None,
        evidence_builder: _EvidenceBuilder | None = None,
    ):
        self._runtime = runtime
        self._run_service = run_service
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

    def start_review_proposal(
        self,
        *,
        session: AgentSession,
        proposal_id: str,
        principal_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> Dict[str, Any]:
        """提交 Proposal Review 到 Codex app-server 异步生命周期。"""
        run_service = self._require_run_service()
        normalized_proposal_id = str(proposal_id or "").strip()
        effective_principal_id = session.principal_id or principal_id
        idempotency_key = (
            idempotency_key
            or f"semantic.modeling.review_proposal:{session.id}:{normalized_proposal_id}"
        )
        request = AgentInferenceRuntimeRequest(
            app_id="semantic_modeling",
            action="semantic.modeling.review_proposal",
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id=session.id,
                thread_id=session.id,
                turn_id=f"review_{uuid4().hex}",
            ),
            principal_id=effective_principal_id,
            input={
                "proposal_id": normalized_proposal_id,
                "session_id": session.id,
                "idempotency_key": idempotency_key,
                "intent": (
                    "Review the saved semantic modeling proposal and return only review "
                    "suggestions, blockers, evidence notes, or patch recommendations."
                ),
            },
            context_pack=self._build_codex_action_context_pack(
                session=session,
                proposal_id=normalized_proposal_id,
                intent="review_proposal",
                principal_id=effective_principal_id,
            ),
            output_schema="semantic.modeling.review_proposal.output.v1",
            runtime_policy=RuntimePolicy(max_runtime_seconds=900, allow_network=False),
            preferred_runtime="codex_app_server",
            execution_mode="async",
            semantic_runtime_pin=None,
            asset_revision_refs=[],
        )
        return run_service.submit(request)

    def start_repair_validation_failure(
        self,
        *,
        session: AgentSession,
        principal_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> Dict[str, Any]:
        """提交 validation failure repair 到 Codex app-server 异步生命周期。"""
        run_service = self._require_run_service()
        state = session.workbench_state or {}
        raw_spec = _sanitize_value(_safe_dict(state.get("raw_spec")))
        validation_summary = _sanitize_value(_safe_list(state.get("validation_summary")))
        effective_principal_id = session.principal_id or principal_id
        idempotency_key = idempotency_key or f"semantic.modeling.repair_validation_failure:{session.id}"
        request = AgentInferenceRuntimeRequest(
            app_id="semantic_modeling",
            action="semantic.modeling.repair_validation_failure",
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id=session.id,
                thread_id=session.id,
                turn_id=f"repair_{uuid4().hex}",
            ),
            principal_id=effective_principal_id,
            input={
                "session_id": session.id,
                "idempotency_key": idempotency_key,
                "raw_spec": raw_spec,
                "validation_summary": validation_summary,
                "intent": (
                    "Repair semantic modeling validation failures. Return only suggestions "
                    "and patch recommendations; do not publish or apply semantic assets."
                ),
            },
            context_pack=self._build_codex_action_context_pack(
                session=session,
                proposal_id=str(
                    session.current_proposal_id
                    or (_safe_dict(state.get("advanced_refs")).get("proposal_id"))
                    or ""
                ).strip() or None,
                intent="repair_validation_failure",
                principal_id=effective_principal_id,
            ),
            output_schema="semantic.modeling.repair_validation_failure.output.v1",
            runtime_policy=RuntimePolicy(max_runtime_seconds=900, allow_network=False),
            preferred_runtime="codex_app_server",
            execution_mode="async",
            semantic_runtime_pin=None,
            asset_revision_refs=[],
        )
        return run_service.submit(request)

    def _require_run_service(self) -> _CodexRunService:
        if self._run_service is None:
            raise AgentInferenceRuntimeError(
                "Codex run service is not configured",
                code="RUNTIME_NOT_CONFIGURED",
                details={"runtime_name": "codex_app_server"},
            )
        if hasattr(self._run_service, "submit"):
            return self._run_service
        if callable(self._run_service):
            resolved = self._run_service()
            if hasattr(resolved, "submit"):
                return resolved
        raise AgentInferenceRuntimeError(
            "Codex run service is not configured",
            code="RUNTIME_NOT_CONFIGURED",
            details={"runtime_name": "codex_app_server"},
        )

    def _build_codex_action_context_pack(
        self,
        *,
        session: AgentSession,
        proposal_id: str | None,
        intent: str,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        state = session.workbench_state or {}
        readiness = _safe_dict(state.get("readiness"))
        return _sanitize_value({
            "intent": intent,
            "session": {
                "id": session.id,
                "user_goal": session.user_goal,
                "entry_type": session.entry_type,
                "state": session.state,
                "status": session.status,
                "principal_id": session.principal_id or principal_id,
                "current_proposal_id": session.current_proposal_id,
                "title": session.title,
            },
            "proposal": {
                "proposal_id": proposal_id,
                "summary": _safe_dict(state.get("proposal_summary")),
                "patch": _safe_dict(state.get("proposal_patch")),
            },
            "current_state": {
                "raw_spec": _safe_dict(state.get("raw_spec")),
                "review_artifact": _safe_dict(state.get("review_artifact")),
                "readiness": readiness,
                "workbench_refs": _safe_dict(state.get("advanced_refs")),
            },
            "blockers": _blockers_from_state(state),
            "validation_summary": _safe_list(state.get("validation_summary")),
            "source_evidence": _safe_dict(state.get("source_evidence")),
        })

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


def _safe_dict(value: Any) -> Dict[str, Any]:
    return deepcopy(value) if isinstance(value, dict) else {}


def _safe_list(value: Any) -> List[Any]:
    return deepcopy(value) if isinstance(value, list) else []


_SENSITIVE_KEY_PARTS = (
    "token",
    "password",
    "secret",
    "api_key",
    "key",
    "credential",
    "authorization",
)
_MASKED_VALUE = "********"
_MAX_CONTEXT_STRING_LENGTH = 4000
_MAX_CONTEXT_LIST_ITEMS = 20
_MAX_CONTEXT_DICT_KEYS = 50


def _sanitize_value(value: Any) -> Any:
    return _sanitize_context_value(value, parent_key=None)


def _sanitize_context_value(value: Any, *, parent_key: str | None) -> Any:
    if parent_key and _is_sensitive_key(parent_key):
        return _MASKED_VALUE
    if isinstance(value, str):
        if len(value) > _MAX_CONTEXT_STRING_LENGTH:
            return value[:_MAX_CONTEXT_STRING_LENGTH] + "...[truncated]"
        return value
    if isinstance(value, list):
        return [
            _sanitize_context_value(item, parent_key=None)
            for item in value[:_MAX_CONTEXT_LIST_ITEMS]
        ]
    if isinstance(value, tuple):
        return [
            _sanitize_context_value(item, parent_key=None)
            for item in list(value)[:_MAX_CONTEXT_LIST_ITEMS]
        ]
    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= _MAX_CONTEXT_DICT_KEYS:
                break
            key_text = str(key)
            sanitized[key_text] = _sanitize_context_value(item, parent_key=key_text)
        return sanitized
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def _blockers_from_state(state: Mapping[str, Any]) -> List[Dict[str, Any]]:
    readiness = state.get("readiness") if isinstance(state.get("readiness"), dict) else {}
    blockers: List[Dict[str, Any]] = []
    for reason in readiness.get("reasons") or []:
        reason_id = str(reason)
        if reason_id and reason_id != "ready_to_save":
            blockers.append({"id": reason_id, "source": "readiness"})
    for item in state.get("required_confirmations") or []:
        if isinstance(item, dict) and not item.get("confirmed"):
            blockers.append({
                "id": str(item.get("id") or item.get("title") or "confirmation"),
                "source": "confirmation",
                "blocking": bool(item.get("blocking", True)),
            })
    return blockers
