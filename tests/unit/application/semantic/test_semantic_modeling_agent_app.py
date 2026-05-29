from __future__ import annotations

import pytest

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.application.semantic.semantic_evidence_builder import SemanticEvidenceBuilder
from app.application.semantic.semantic_modeling_agent_app import SemanticModelingAgentApp
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeResult
from app.domain.semantic.modeling_agent_session import AgentSession


class _Runtime:
    def __init__(self):
        self.requests = []

    def invoke(self, request):
        self.requests.append(request)
        return AgentInferenceRuntimeResult(
            run_id="run_1",
            status="succeeded",
            runtime_name="openai_compatible",
            action=request.action,
            structured_output={
                "message": "已识别学生评论分析诉求",
                "workbench_state_patch": {
                    "agent_message": "已识别学生评论分析诉求",
                    "readiness": {
                        "exploratory_ready": False,
                        "reasons": ["need_source_table"],
                    },
                },
                "proposal_patch": {
                    "source_mode": "agent_led",
                    "source_kind": "business_question",
                },
                "required_confirmations": [],
                "suggested_actions": ["provide_source_table"],
                "tool_traces": [{"tool": "llm.chat"}],
            },
            artifacts=[],
            usage={"total_tokens": 7},
            trace=[{"event_type": "runtime.trace", "seq": 1}],
            error=None,
        )


class _RunService:
    def __init__(self):
        self.requests = []

    def submit(self, request):
        self.requests.append(request)
        return {
            "run_id": "run_review_1",
            "provider_run_id": "provider_review_1",
            "status": "queued",
        }


class _EvidenceBuilder:
    def build(self, *, session, user_message, request_payload):
        return {
            "session": {"id": session.id, "user_goal": session.user_goal},
            "request_payload": request_payload,
            "evidence": [],
        }


class _RuntimeWithOutput:
    def __init__(self, structured_output):
        self.structured_output = structured_output

    def invoke(self, request):
        return AgentInferenceRuntimeResult(
            run_id="run_1",
            status="succeeded",
            runtime_name="openai_compatible",
            action=request.action,
            structured_output=self.structured_output,
            artifacts=[],
            usage={},
            trace=[{"event_type": "run.succeeded", "seq": 1}],
            error=None,
        )


def test_semantic_modeling_agent_app_builds_runtime_request_and_output():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
    )
    runtime = _Runtime()
    app = SemanticModelingAgentApp(runtime=runtime, evidence_builder=_EvidenceBuilder())

    output = app.run_chat(
        session=session,
        user_message="按学校汇总",
        request_payload={"source": "chat"},
    )

    assert output.message == "已识别学生评论分析诉求"
    assert output.workbench_state_patch["agent_message"] == "已识别学生评论分析诉求"
    assert output.suggested_actions == ["provide_source_table"]
    assert output.tool_traces == [{"tool": "llm.chat"}]
    request = runtime.requests[0]
    assert request.app_id == "semantic_modeling"
    assert request.action == "semantic.modeling.chat"
    assert request.runtime_context_ref.session_id == "session_1"
    assert request.runtime_context_ref.turn_id.startswith("turn_")
    assert request.output_schema == "semantic.modeling.chat.output.v1"
    assert request.input == {
        "message": "按学校汇总",
        "user_goal": "查询最近 7 天学生评论数",
    }


def test_start_review_proposal_builds_async_codex_run_request():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
        current_proposal_id="proposal_1",
        workbench_state={
            "raw_spec": {"spec_version": "v1", "cube": {"name": "student_comment_cube"}},
            "review_artifact": {"status": "ready"},
            "validation_summary": [{"severity": "warning", "message": "缺少指标描述"}],
            "readiness": {"reasons": ["business_owner_confirmation_required"]},
            "source_evidence": {"source_table": {"name": "dwd_student_comment_events"}},
        },
    )
    run_service = _RunService()
    app = SemanticModelingAgentApp(runtime=_Runtime(), run_service=run_service)

    result = app.start_review_proposal(session=session, proposal_id="proposal_1")

    assert result == {
        "run_id": "run_review_1",
        "provider_run_id": "provider_review_1",
        "status": "queued",
    }
    request = run_service.requests[0]
    assert request.app_id == "semantic_modeling"
    assert request.action == "semantic.modeling.review_proposal"
    assert request.preferred_runtime == "codex_app_server"
    assert request.execution_mode == "async"
    assert request.principal_id == "alice"
    assert request.runtime_context_ref.session_id == "session_1"
    assert request.runtime_context_ref.thread_id == "session_1"
    assert request.runtime_context_ref.turn_id.startswith("review_")
    assert request.input["proposal_id"] == "proposal_1"
    assert request.input["session_id"] == "session_1"
    assert "review" in request.input["intent"].lower()
    assert request.context_pack["session"]["user_goal"] == "查询最近 7 天学生评论数"
    assert request.context_pack["proposal"]["proposal_id"] == "proposal_1"
    assert request.context_pack["current_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert request.context_pack["validation_summary"][0]["message"] == "缺少指标描述"
    assert request.context_pack["source_evidence"]["source_table"]["name"] == "dwd_student_comment_events"


def test_start_review_proposal_uses_effective_principal_for_legacy_session():
    session = AgentSession(
        id="session_legacy",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id=None,
        current_proposal_id="proposal_1",
    )
    run_service = _RunService()
    app = SemanticModelingAgentApp(runtime=_Runtime(), run_service=run_service)

    app.start_review_proposal(
        session=session,
        proposal_id="proposal_1",
        principal_id="alice",
    )

    assert run_service.requests[0].principal_id == "alice"
    assert run_service.requests[0].context_pack["session"]["principal_id"] == "alice"


def test_start_repair_validation_failure_builds_async_codex_run_request():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
        workbench_state={
            "raw_spec": {"spec_version": "v1", "cube": {"name": "student_comment_cube"}},
            "validation_summary": [
                {
                    "severity": "error",
                    "message": "缺少时间维度",
                    "path": "ontology.metrics.comment_count.time_dimension",
                }
            ],
            "readiness": {"reasons": ["validation_blocked"]},
            "source_evidence": {"fields": [{"name": "published_at"}]},
        },
    )
    run_service = _RunService()
    app = SemanticModelingAgentApp(runtime=_Runtime(), run_service=run_service)

    result = app.start_repair_validation_failure(session=session)

    assert result["run_id"] == "run_review_1"
    request = run_service.requests[0]
    assert request.action == "semantic.modeling.repair_validation_failure"
    assert request.preferred_runtime == "codex_app_server"
    assert request.execution_mode == "async"
    assert request.runtime_context_ref.turn_id.startswith("repair_")
    assert request.input["session_id"] == "session_1"
    assert request.input["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert request.input["validation_summary"][0]["path"] == "ontology.metrics.comment_count.time_dimension"
    assert request.context_pack["current_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert request.context_pack["blockers"][0]["id"] == "validation_blocked"


def test_codex_action_context_pack_masks_sensitive_values_and_limits_payload_size():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
        current_proposal_id="proposal_1",
        workbench_state={
            "raw_spec": {
                "spec_version": "v1",
                "cube": {
                    "name": "student_comment_cube",
                    "api_key": "sk-secret",
                    "description": "x" * 5000,
                },
            },
            "review_artifact": {
                "authorization": "Bearer hidden",
                "notes": [{"idx": idx} for idx in range(30)],
            },
            "source_evidence": {
                "password": "plain-text",
                "fields": [{"name": f"field_{idx}"} for idx in range(30)],
            },
            "validation_summary": [{"message": f"issue_{idx}"} for idx in range(30)],
        },
    )
    run_service = _RunService()
    app = SemanticModelingAgentApp(runtime=_Runtime(), run_service=run_service)

    app.start_review_proposal(session=session, proposal_id="proposal_1")

    context_pack = run_service.requests[0].context_pack
    cube = context_pack["current_state"]["raw_spec"]["cube"]
    assert cube["api_key"] == "********"
    assert len(cube["description"]) <= 4000 + len("...[truncated]")
    assert context_pack["current_state"]["review_artifact"]["authorization"] == "********"
    assert len(context_pack["current_state"]["review_artifact"]["notes"]) == 20
    assert context_pack["source_evidence"]["password"] == "********"
    assert len(context_pack["source_evidence"]["fields"]) == 20
    assert len(context_pack["validation_summary"]) == 20


def test_semantic_evidence_builder_uses_session_summary_and_limited_tail():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        state="analyzing",
        principal_id="alice",
        title="评论数分析",
        current_proposal_id="proposal_1",
        workbench_state={"readiness": {"exploratory_ready": False}},
        tool_traces=[{"tool": "legacy.trace"}],
        event_log=[{"type": "session_action"}],
    )
    for index in range(10):
        session.add_message(role="user", content=f"第 {index} 轮")

    context_pack = SemanticEvidenceBuilder().build(
        session=session,
        user_message="按学校汇总",
        request_payload={"source": "chat"},
    )

    assert context_pack["session"] == {
        "id": "session_1",
        "user_goal": "查询最近 7 天学生评论数",
        "entry_type": "business_question",
        "state": "analyzing",
        "status": "active",
        "principal_id": "alice",
        "current_proposal_id": "proposal_1",
        "title": "评论数分析",
    }
    assert "conversation" not in context_pack["session"]
    assert "tool_traces" not in context_pack["session"]
    assert "event_log" not in context_pack["session"]
    assert context_pack["latest_user_message"] == "按学校汇总"
    assert context_pack["request_payload"] == {"source": "chat"}
    assert context_pack["workbench_state"] == {"readiness": {"exploratory_ready": False}}
    assert len(context_pack["conversation_tail"]) == 8
    assert context_pack["conversation_tail"][0]["content"] == "第 2 轮"
    assert context_pack["conversation_tail"][-1]["content"] == "第 9 轮"
    assert context_pack["evidence"] == []


@pytest.mark.parametrize(
    "structured_output",
    [
        [("message", "不要用 dict(list) 误解析")],
        {},
        {"message": ""},
        {"message": "   "},
        {"message": 123},
    ],
)
def test_semantic_modeling_agent_app_rejects_invalid_structured_output(structured_output):
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
    )
    app = SemanticModelingAgentApp(
        runtime=_RuntimeWithOutput(structured_output),
        evidence_builder=_EvidenceBuilder(),
    )

    with pytest.raises(AgentInferenceRuntimeError) as exc_info:
        app.run_chat(session=session, user_message="按学校汇总", request_payload={})

    assert exc_info.value.code == "RUNTIME_INVALID_OUTPUT"


def test_semantic_modeling_agent_app_rejects_malformed_required_confirmations():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
    )
    app = SemanticModelingAgentApp(
        runtime=_RuntimeWithOutput(
            {
                "message": "已识别学生评论分析诉求",
                "required_confirmations": ["confirm_source_candidate"],
            }
        ),
        evidence_builder=_EvidenceBuilder(),
    )

    with pytest.raises(AgentInferenceRuntimeError) as exc_info:
        app.run_chat(session=session, user_message="按学校汇总", request_payload={})

    assert exc_info.value.code == "RUNTIME_INVALID_OUTPUT"
