from __future__ import annotations

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


def test_semantic_evidence_builder_includes_session_message_payload_and_tail():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        principal_id="alice",
        workbench_state={"readiness": {"exploratory_ready": False}},
    )
    session.add_message(role="user", content="第一轮")
    session.add_message(role="assistant", content="请提供来源表")

    context_pack = SemanticEvidenceBuilder().build(
        session=session,
        user_message="按学校汇总",
        request_payload={"source": "chat"},
    )

    assert context_pack["session"]["id"] == "session_1"
    assert context_pack["latest_user_message"] == "按学校汇总"
    assert context_pack["request_payload"] == {"source": "chat"}
    assert context_pack["workbench_state"] == {"readiness": {"exploratory_ready": False}}
    assert context_pack["conversation_tail"][-1]["content"] == "请提供来源表"
    assert context_pack["evidence"] == []


def test_semantic_modeling_agent_app_treats_non_dict_structured_output_as_empty():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
    )
    app = SemanticModelingAgentApp(
        runtime=_RuntimeWithOutput([("message", "不要用 dict(list) 误解析")]),
        evidence_builder=_EvidenceBuilder(),
    )

    output = app.run_chat(session=session, user_message="按学校汇总", request_payload={})

    assert output.message == ""
    assert output.workbench_state_patch == {}
    assert output.proposal_patch == {}
    assert output.required_confirmations == []
    assert output.suggested_actions == []
    assert output.tool_traces == [{"event_type": "run.succeeded", "seq": 1}]
