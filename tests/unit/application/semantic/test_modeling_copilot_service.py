import json
from copy import deepcopy

from app.application.semantic.modeling_copilot_runtime import (
    AgentRunResult,
    LLMRequiredError,
    OpenAICompatibleLLMAdapter,
)
from app.application.semantic.modeling_copilot_service import SemanticModelingCopilotService
from app.domain.semantic.modeling_agent_session import AgentSession


class _SessionRepository:
    def __init__(self):
        self.items = {}

    def get(self, session_id: str):
        return self.items.get(session_id)

    def save(self, session: AgentSession, *, expected_state_version=None) -> None:
        self.items[session.id] = session

    def list(self, principal_id=None, *, limit=50, offset=0, status=None, include_legacy=True):
        items = []
        for s in self.items.values():
            if principal_id is not None:
                if s.principal_id is None:
                    if not include_legacy:
                        continue
                elif s.principal_id != principal_id:
                    continue
            if status is not None and s.status != status:
                continue
            items.append(s)
        items.sort(key=lambda s: s.updated_at or "", reverse=True)
        return items[offset:offset + limit]

    def delete(self, session_id: str) -> None:
        self.items.pop(session_id, None)

    def update_metadata(self, session_id: str, *, title=None):
        s = self.items.get(session_id)
        if s is None:
            return None
        if title is not None:
            s.title = title.strip() or None
        return s


class _Runtime:
    def __init__(self):
        self.calls = []

    def run(self, *, session, user_message, tools, context=None):
        self.calls.append((session.id, user_message, context))
        return AgentRunResult(
            message="已找到候选语义，请确认学校维度和时间口径。",
            workbench_state_patch={
                "semantic_canvas": {
                    "objects": [{"name": "student_comment", "title": "学生评论"}],
                    "metrics": [{"name": "student_comment_count", "title": "学生评论数"}],
                    "dimensions": [{"name": "school_id", "title": "学校"}],
                    "bindings": [
                        {
                            "metric": "student_comment_count",
                            "measure_ref": "student_comment_cube.comment_count",
                            "status": "proposed",
                        }
                    ],
                    "policies": [{"name": "school_scope", "visibility": "restricted"}],
                },
                "candidate_cards": [{"id": "confirm_school_dimension", "title": "学校维度"}],
                "readiness": {
                    "canonical_ready": False,
                    "exploratory_ready": True,
                    "reasons": ["business_owner_confirmation_required", "binding_not_approved"],
                },
                # 与真实 Copilot LLM 链一致：完整 spec 落在 raw_spec，保存 Proposal 时走 embedded_spec
                "raw_spec": {
                    "spec_version": "v1",
                    "source": {
                        "source_kind": "physical_table",
                        "source_id": 7,
                        "database": "dw",
                        "table": "dwd_student_comment_events",
                    },
                    "business": {"subject": "学生评论", "sensitivity_level": "restricted"},
                    "cube": {"name": "student_comment_cube", "dimensions": {}, "measures": {}},
                    "ontology": {
                        "object": {"name": "student_comment"},
                        "metrics": [],
                        "glossary": [],
                        "policies": [],
                    },
                },
            },
            proposal_patch={
                "source_mode": "agent_led",
                "source_kind": "business_question",
                "user_question": "查询最近7天学生评论数，按学校汇总",
                "business_subject": "学生评论",
                "candidate_bindings": [{"measure_ref": "student_comment_cube.comment_count"}],
                "candidate_table": "df_cb_258187.dwd_interaction_comment_reports_df",
                "table": "df_cb_258187.dwd_interaction_comment_reports_df",
            },
            required_confirmations=[
                {"id": "confirm_school_dimension", "title": "学校维度", "recommended_value": "school_id", "blocking": True}
            ],
            suggested_actions=["confirm_candidates", "save_proposal"],
            tool_traces=[{"tool": "search_cube", "status": "completed"}],
        )


class _UnsafePublishingRuntime:
    def __init__(self):
        self.calls = []

    def run(self, *, session, user_message, tools, context=None):
        self.calls.append((session.id, user_message, context))
        return AgentRunResult(
            message="我已经发布好了。",
            workbench_state_patch={
                "raw_spec": {
                    "spec_version": "v1",
                    "source": {
                        "source_kind": "physical_table",
                        "source_id": 7,
                        "database": "dw",
                        "table": "dwd_student_comment_events",
                    },
                    "business": {"subject": "学生评论", "sensitivity_level": "restricted"},
                    "cube": {"name": "student_comment_cube", "dimensions": {}, "measures": {}},
                    "ontology": {"object": {"name": "student_comment"}, "metrics": []},
                },
                "advanced_refs": {"proposal_id": "forged_proposal"},
                "save_result": {"status": "saved", "proposal_id": "forged_proposal"},
                "proposal_summary": {"id": "forged_proposal", "status": "published"},
                "publish_result": {"status": "published", "proposal_id": "forged_proposal"},
                "post_publish_validation": {"status": "passed"},
            },
            proposal_patch={
                "source_mode": "agent_led",
                "source_kind": "business_question",
                "user_question": "查询最近7天学生评论数，按学校汇总",
            },
            suggested_actions=["open_data_chat"],
        )


class _Tools:
    def __init__(self):
        self.calls = []

    def execute(self, tool_name, arguments, context):
        self.calls.append((tool_name, arguments))
        if tool_name == "sandbox_preview":
            return {"status": "ready", "pollutes_official_route": False}
        if tool_name == "generate_semantic_draft":
            table = arguments.get("table") or "df_cb_258187.dwd_interaction_comment_reports_df"
            return {
                "summary": "已生成学生评论 spec",
                "spec": {
                    "spec_version": "v1",
                    "source": {"source_kind": "physical_table", "table": table},
                    "business": {"subject": "学生评论", "sensitivity_level": "restricted"},
                    "cube": {"name": "student_comment_cube", "source": table, "dimensions": {}, "measures": {}},
                    "ontology": {"object": {"name": "student_comment", "title": "学生评论"}, "metrics": []},
                },
                "next_actions": {"default_publish_target": "cube_and_ontology"},
            }
        if tool_name == "build_evidence_pack":
            return {"summary": "已构建证据包", "items": [{"id": "p1", "trust_level": "P1"}]}
        if tool_name == "run_validation":
            return {"summary": "已运行建模校验", "validation": {"status": "passed", "issues": []}}
        return {"error": f"unexpected tool: {tool_name}"}


class _ProposalService:
    def __init__(self):
        self.calls = []
        self.payloads = []
        self.approve_payloads = []
        self.publish_targets = []

    def create_proposal(self, payload):
        self.calls.append("create")
        self.payloads.append(deepcopy(payload))
        return {"id": "proposal_1", "status": "created", "intent": payload}

    def approve(self, proposal_id, payload=None):
        self.calls.append("approve")
        self.approve_payloads.append(deepcopy(payload or {}))
        return {
            "id": proposal_id,
            "status": "approved",
            "review_records": [{"approved_by": (payload or {}).get("approved_by"), "timestamp": "2026-05-10T12:00:00"}],
        }

    def apply(self, proposal_id):
        self.calls.append("apply")
        return {"id": proposal_id, "status": "applied", "applied_spec_hash": "sha-test"}

    def publish(self, proposal_id, publish_targets=None):
        self.calls.append("publish")
        self.publish_targets.append(publish_targets)
        return {
            "id": proposal_id,
            "status": "published",
            "publish_result": {
                "cube": {"name": "student_comment_cube", "status": "active"},
                "ontology": {"object": "student_comment", "status": "active"},
            },
        }

    def draft(self, proposal_id):
        self.calls.append("draft")
        return {"id": proposal_id, "status": "drafted", "spec": {"spec_version": "v1"}}

    def validate(self, proposal_id):
        self.calls.append("validate")
        return {
            "id": proposal_id,
            "status": "validated",
            "runtime_consumption_result": {"canonical_ready": False, "reasons": ["binding_not_approved"]},
        }


class _DriftProposalService(_ProposalService):
    def apply(self, proposal_id):
        self.calls.append("apply")
        raise ValueError("Applied assets drift from approved semantic_diff")


class _ApprovalRequiresValidationProposalService(_ProposalService):
    def __init__(self):
        super().__init__()
        self.validated = set()

    def validate(self, proposal_id):
        self.calls.append("validate")
        self.validated.add(proposal_id)
        return {
            "id": proposal_id,
            "status": "validated",
            "runtime_consumption_result": {"canonical_ready": True, "reasons": []},
        }

    def approve(self, proposal_id, payload=None):
        if proposal_id not in self.validated:
            raise ValueError("Proposal must be validated before approved")
        return super().approve(proposal_id, payload)


class _PublishValidationBlockedProposalService(_ProposalService):
    def approve(self, proposal_id, payload=None):
        self.calls.append("approve")
        raise ValueError("Proposal must be validated before approved")

    def validate(self, proposal_id):
        self.calls.append("validate")
        return {
            "id": proposal_id,
            "status": "blocked",
            "validation_matrix": {
                "blockers": [
                    {
                        "severity": "error",
                        "code": "metric_time_dimension_missing",
                        "path": "ontology.metrics.student_comment_total_count.time_dimension",
                    }
                ]
            },
        }


def _service(proposal_service=None):
    repo = _SessionRepository()
    runtime = _Runtime()
    tools = _Tools()
    proposal_service = proposal_service or _ProposalService()
    return SemanticModelingCopilotService(
        session_repository=repo,
        runtime=runtime,
        tools=tools,
        proposal_service=proposal_service,
    ), repo, runtime, proposal_service


def test_copilot_session_turn_updates_workbench_without_publishing():
    service, _, runtime, _ = _service()

    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    assert created["entry_type"] == "business_question"
    assert created["state"] == "created"
    assert created["state_version"] == 1
    assert created["workbench_state"]["suggested_actions"] == ["send_goal"]

    updated = service.send_message(created["id"], {"message": "按学校汇总，不展示 restricted 字段"})

    assert runtime.calls[0][1] == "按学校汇总，不展示 restricted 字段"
    assert updated["state"] == "awaiting_confirmation"
    assert updated["state_version"] == 2
    assert updated["state_history"][-1]["to_state"] == "awaiting_confirmation"
    assert updated["event_log"][-1]["action"] == "created_to_awaiting_confirmation"
    assert updated["workbench_state"]["semantic_canvas"]["metrics"][0]["name"] == "student_comment_count"
    assert updated["workbench_state"]["required_confirmations"][0]["id"] == "confirm_school_dimension"
    assert updated["tool_traces"][0]["tool"] == "search_cube"
    assert updated.get("current_proposal_id") is None


def test_llm_patch_cannot_forge_saved_or_published_state():
    repo = _SessionRepository()
    runtime = _UnsafePublishingRuntime()
    tools = _Tools()
    proposals = _ProposalService()
    service = SemanticModelingCopilotService(
        session_repository=repo,
        runtime=runtime,
        tools=tools,
        proposal_service=proposals,
    )

    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    updated = service.send_message(created["id"], {"message": "生成并发布语义"})

    assert proposals.calls == []
    assert updated.get("current_proposal_id") is None
    assert updated["state"] == "spec_ready"
    assert "publish_result" not in updated["workbench_state"]
    assert "save_result" not in updated["workbench_state"]
    assert updated["workbench_state"].get("proposal_summary") in ({}, None)
    assert updated["workbench_state"]["advanced_refs"].get("proposal_id") is None


def test_copilot_state_progresses_from_spec_to_saved_and_published():
    service, _, _, _ = _service()

    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})
    confirmed = service.confirm(
        analyzed["id"],
        {"confirmation_id": "confirm_school_dimension", "value": "school_id"},
    )
    accepted = service.accept_cube_draft(confirmed["id"])
    saved = service.save_proposal(accepted["id"])
    published = service.publish_proposal(saved["id"])

    assert analyzed["state"] == "awaiting_confirmation"
    assert confirmed["state"] == "spec_ready"
    assert accepted["state"] == "spec_ready"
    assert saved["state"] == "proposal_saved"
    assert published["state"] == "published"
    assert published["status"] == "completed"
    assert [event["action"] for event in published["event_log"] if event["type"] == "proposal_action"] == [
        "save_proposal",
        "publish",
    ]


def test_copilot_accept_cube_draft_is_deterministic_state_action():
    service, _, runtime, _ = _service()

    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})
    runtime_call_count = len(runtime.calls)

    accepted = service.accept_cube_draft(analyzed["id"])

    assert len(runtime.calls) == runtime_call_count
    assert accepted["workbench_state"]["cube_draft_accepted"] is True
    assert accepted["workbench_state"]["spec_lock"]["status"] == "accepted"
    assert accepted["workbench_state"]["agent_message"] == "已接受 Cube 草稿，当前 spec 已锁定。你可以继续沙盒预演或应用语义。"


def test_copilot_chat_accept_cube_draft_is_deterministic_state_action():
    service, _, runtime, _ = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})
    runtime_call_count = len(runtime.calls)

    accepted = service.send_message(analyzed["id"], {"message": "接受 Cube 草稿，把 spec 锁定。"})

    assert len(runtime.calls) == runtime_call_count
    assert accepted["workbench_state"]["cube_draft_accepted"] is True
    assert accepted["conversation"][-1]["content"] == "已接受 Cube 草稿，当前 spec 已锁定。你可以继续沙盒预演或应用语义。"


def test_copilot_chat_use_recommendations_confirms_required_items_without_llm():
    service, _, runtime, _ = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})
    runtime_call_count = len(runtime.calls)

    confirmed = service.send_message(analyzed["id"], {"message": "使用推荐"})

    assert len(runtime.calls) == runtime_call_count
    assert confirmed["workbench_state"]["required_confirmations"] == []
    assert confirmed["working_memory"]["confirmed_assumptions"][0]["id"] == "confirm_school_dimension"
    assert confirmed["working_memory"]["confirmed_assumptions"][0]["value"] == "school_id"


def test_copilot_confirm_last_required_item_generates_spec_without_llm():
    service, repo, runtime, _ = _service()
    session = AgentSession(
        id="stuck_after_confirmation",
        user_goal="查询最近7天学生评论数，按学校汇总",
        entry_type="business_question",
        workbench_state={
            "semantic_canvas": {
                "objects": [{"name": "student_comment", "title": "学生评论"}],
                "metrics": [{"name": "student_comment_count", "title": "评论数"}],
                "dimensions": [{"name": "school_id", "title": "学校"}],
                "bindings": [{"measure_ref": "student_comment_cube.comment_count", "status": "proposed"}],
                "policies": [],
            },
            "candidate_cards": [{"id": "time_range_scope", "title": "统计时间范围"}],
            "required_confirmations": [
                {
                    "id": "time_range_scope",
                    "title": "统计时间范围",
                    "recommended_value": "最近 7 天",
                    "blocking": True,
                }
            ],
            "readiness": {
                "canonical_ready": False,
                "exploratory_ready": False,
                "reasons": ["business_owner_confirmation_required", "spec_not_generated"],
            },
            "proposal_patch": {
                "source_mode": "agent_led",
                "source_kind": "business_question",
                "user_question": "查询最近7天学生评论数，按学校汇总",
                "business_subject": "学生评论",
                "candidate_table": "df_cb_258187.dwd_interaction_comment_reports_df",
                "table": "df_cb_258187.dwd_interaction_comment_reports_df",
                "candidate_bindings": [{"measure_ref": "student_comment_cube.comment_count"}],
            },
            "raw_spec": {},
            "advanced_refs": {"proposal_id": None, "spec_available": False, "trace_available": False},
        },
    )
    repo.save(session)

    confirmed = service.confirm(
        session.id,
        {"confirmation_id": "time_range_scope", "value": "最近 7 天"},
    )

    assert runtime.calls == []
    assert confirmed["workbench_state"]["required_confirmations"] == []
    assert confirmed["workbench_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert confirmed["workbench_state"]["raw_spec"]["cube"]["measures"]["total_count"]["certified"] is True
    assert confirmed["workbench_state"]["advanced_refs"]["spec_available"] is True
    assert "spec_not_generated" not in confirmed["workbench_state"]["readiness"]["reasons"]
    assert confirmed["workbench_state"]["suggested_actions"] == ["run_sandbox", "save_proposal"]
    assert confirmed["conversation"][-1]["content"].startswith("已确认 time_range_scope，并已生成可审阅 spec")
    assert confirmed["tool_traces"][-1]["tool"] == "generate_semantic_draft"


def test_copilot_chat_use_recommendations_generates_spec_when_all_confirmations_done_without_llm():
    service, repo, runtime, _ = _service()
    session = AgentSession(
        id="use_recommendation_without_spec",
        user_goal="查询最近7天学生评论数，按学校汇总",
        entry_type="business_question",
        workbench_state={
            "semantic_canvas": {"objects": [], "metrics": [], "dimensions": [], "bindings": [], "policies": []},
            "candidate_cards": [{"id": "confirm_school_dimension", "title": "学校维度"}],
            "required_confirmations": [
                {
                    "id": "confirm_school_dimension",
                    "title": "学校维度",
                    "recommended_value": "school_id",
                    "blocking": True,
                }
            ],
            "readiness": {
                "canonical_ready": False,
                "exploratory_ready": False,
                "reasons": ["business_owner_confirmation_required", "spec_not_generated"],
            },
            "proposal_patch": {
                "source_mode": "agent_led",
                "source_kind": "business_question",
                "user_question": "查询最近7天学生评论数，按学校汇总",
                "business_subject": "学生评论",
                "candidate_table": "df_cb_258187.dwd_interaction_comment_reports_df",
                "table": "df_cb_258187.dwd_interaction_comment_reports_df",
            },
            "raw_spec": {},
            "advanced_refs": {"proposal_id": None, "spec_available": False, "trace_available": False},
        },
    )
    repo.save(session)

    confirmed = service.send_message(session.id, {"message": "使用推荐"})

    assert runtime.calls == []
    assert confirmed["workbench_state"]["required_confirmations"] == []
    assert confirmed["workbench_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert confirmed["workbench_state"]["advanced_refs"]["spec_available"] is True
    assert confirmed["conversation"][-1]["content"].startswith("已按推荐值确认 1 项口径，并已生成可审阅 spec")


def test_copilot_get_session_resumes_confirmed_session_waiting_for_spec_without_llm():
    service, repo, runtime, _ = _service()
    session = AgentSession(
        id="confirmed_but_waiting_for_spec",
        user_goal="查询最近7天学生评论数，按学校汇总",
        entry_type="business_question",
        workbench_state={
            "semantic_canvas": {
                "objects": [{"name": "student_comment", "title": "学生评论"}],
                "metrics": [{"name": "student_comment_count", "title": "评论数"}],
                "dimensions": [{"name": "school_name", "title": "学校名称"}, {"name": "ds", "title": "统计日期"}],
                "bindings": [],
                "policies": [],
            },
            "candidate_cards": [],
            "required_confirmations": [],
            "readiness": {
                "canonical_ready": False,
                "exploratory_ready": False,
                "reasons": ["spec_not_generated"],
            },
            "proposal_patch": {
                "source_mode": "agent_led",
                "source_kind": "business_question",
                "user_question": "查询最近7天学生评论数，按学校汇总",
                "business_subject": "学生评论",
                "candidate_table": "df_cb_258187.dwd_interaction_comment_reports_df",
            },
            "raw_spec": {},
            "advanced_refs": {"proposal_id": None, "spec_available": False, "trace_available": False},
        },
    )
    repo.save(session)

    resumed = service.get_session(session.id)

    assert runtime.calls == []
    assert resumed["workbench_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert resumed["workbench_state"]["advanced_refs"]["spec_available"] is True
    assert resumed["workbench_state"]["agent_message"].startswith("已根据已确认口径补齐可审阅 spec")
    assert resumed["tool_traces"][-1]["tool"] == "generate_semantic_draft"


def test_copilot_confirm_and_save_proposal_go_through_governed_service():
    service, _, _, proposals = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    updated = service.send_message(created["id"], {"message": "生成学生评论语义"})

    confirmed = service.confirm(
        updated["id"],
        {"confirmation_id": "confirm_school_dimension", "value": "school_id"},
    )
    assert confirmed["working_memory"]["confirmed_assumptions"][0]["value"] == "school_id"
    assert confirmed["workbench_state"]["required_confirmations"] == []
    assert "business_owner_confirmation_required" not in confirmed["workbench_state"]["readiness"]["reasons"]

    saved = service.save_proposal(updated["id"])

    assert saved["current_proposal_id"] == "proposal_1"
    assert proposals.calls == ["create", "draft", "validate"]
    # Agent-led 候选表只作为证据，顶层 payload 不出现正式 table；完整 spec 用 embedded_spec 带给 draft。
    assert "table" not in proposals.payloads[0]
    assert proposals.payloads[0]["candidate_table"] == "df_cb_258187.dwd_interaction_comment_reports_df"
    assert proposals.payloads[0]["embedded_spec"]["spec_version"] == "v1"
    assert proposals.payloads[0]["embedded_spec"]["cube"]["name"] == "student_comment_cube"
    assert proposals.payloads[0]["embedded_spec"]["cube"]["measures"]["total_count"]["certified"] is True
    assert proposals.payloads[0]["embedded_spec"]["ontology"]["metrics"][0]["name"] == "student_comment_total_count"
    assert proposals.payloads[0]["embedded_spec"]["ontology"]["metrics"][0]["grain"] == "school_id,published_at"
    assert proposals.payloads[0]["embedded_spec"]["ontology"]["metrics"][0]["time_dimension"] == "published_at"
    assert proposals.payloads[0]["embedded_spec"]["ontology"]["metrics"][0]["binding_status"] == "approved"
    assert saved["workbench_state"]["save_result"]["idempotent"] is False
    assert saved["workbench_state"]["next_steps"][0]["id"] == "governance_review"


def test_copilot_save_proposal_requires_raw_spec_before_governed_service():
    import pytest

    service, _, _, proposals = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})

    with pytest.raises(ValueError, match="SPEC_REQUIRED"):
        service.save_proposal(created["id"])

    assert proposals.calls == []


def test_copilot_review_artifact_projects_draft_session_without_proposal():
    service, _, _, _ = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})

    review = service.get_review(analyzed["id"])

    assert review["session_id"] == analyzed["id"]
    assert review["proposal_id"] is None
    assert review["status"] == "blocked"
    assert review["status_label"] == "当前只能保存草稿"
    assert review["data_agent_consumption"]["state"] == "draft_only"
    assert review["primary_action"]["action"] == "save_proposal"
    assert {change["technical_name"] for change in review["changes"]} >= {
        "student_comment_cube",
        "student_comment_count",
        "student_comment",
    }
    assert {blocker["id"] for blocker in review["blockers"]} >= {
        "confirm_school_dimension",
    }
    assert "binding_not_approved" not in {blocker["id"] for blocker in review["blockers"]}


def test_copilot_chat_explains_blocker_without_llm_timeout():
    service, _, runtime, _ = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})
    runtime_call_count = len(runtime.calls)

    answered = service.send_message(analyzed["id"], {"message": "请解释「学校维度口径待确认」为什么会阻塞发布，以及我应该怎么处理。"})

    assert len(runtime.calls) == runtime_call_count
    assert "学校维度" in answered["conversation"][-1]["content"]
    assert "使用推荐" in answered["conversation"][-1]["content"]


def test_copilot_review_exposes_source_trace_publish_gate_and_acceptance():
    service, _, _, proposals = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    analyzed = service.send_message(created["id"], {"message": "生成学生评论语义"})

    draft_review = service.get_review(analyzed["id"])

    assert draft_review["source_evidence"]["source_table"]["name"] == "df_cb_258187.dwd_interaction_comment_reports_df"
    assert {field["name"] for field in draft_review["source_evidence"]["fields"]} >= {
        "school_id",
        "published_at",
        "comment_count",
    }
    assert draft_review["trace_state"]["events"][0]["title"] == "search_cube"
    assert draft_review["publish_gate"]["state"] == "blocked"
    assert draft_review["post_publish_validation"]["status"] == "not_run"

    service.confirm(analyzed["id"], {"confirmation_id": "confirm_school_dimension", "value": "school_id"})
    saved = service.save_proposal(analyzed["id"])
    published = service.publish_proposal(saved["id"])
    published_review = service.get_review(published["id"])

    assert proposals.calls == ["create", "draft", "validate", "approve", "apply", "publish"]
    assert published_review["publish_gate"]["state"] == "published"
    assert published_review["post_publish_validation"]["status"] == "passed"
    assert published_review["post_publish_validation"]["runtime_route"] == "student_comment_cube"
    assert published_review["data_agent_consumption"]["state"] == "available"


def test_copilot_save_proposal_is_idempotent_after_first_save():
    service, _, _, proposals = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    updated = service.send_message(created["id"], {"message": "生成学生评论语义"})
    service.confirm(
        updated["id"],
        {"confirmation_id": "confirm_school_dimension", "value": "school_id"},
    )

    first_saved = service.save_proposal(updated["id"])
    second_saved = service.save_proposal(updated["id"])

    assert first_saved["current_proposal_id"] == "proposal_1"
    assert second_saved["current_proposal_id"] == "proposal_1"
    assert proposals.calls == ["create", "draft", "validate"]
    assert second_saved["workbench_state"]["save_result"]["status"] == "already_saved"
    assert second_saved["workbench_state"]["save_result"]["idempotent"] is True
    assert [message["content"] for message in second_saved["conversation"]].count(
        "Proposal proposal_1 已保存。下一步进入治理审核，或继续补充业务口径。"
    ) == 1


def test_copilot_get_session_hydrates_raw_spec_from_saved_proposal():
    service, repo, _, proposals = _service()
    session = AgentSession(
        id="session_with_saved_proposal",
        user_goal="查询最近7天学生评论数，按学校汇总",
        entry_type="business_question",
        current_proposal_id="proposal_1",
        workbench_state={
            "proposal_summary": {
                "id": "proposal_1",
                "spec": {
                    "spec_version": "v1",
                    "cube": {
                        "name": "student_comment_cube",
                        "dimensions": {
                            "school_id": {"title": "学校", "type": "string"},
                            "published_at": {"title": "发布时间", "type": "time"},
                        },
                        "measures": {"comment_count": {"title": "评论数", "type": "count", "sql": "COUNT(*)"}},
                    },
                    "ontology": {"object": {"name": "student_comment"}, "metrics": []},
                },
            },
            "raw_spec": {},
        },
    )
    repo.save(session)

    hydrated = service.get_session(session.id)

    assert proposals.calls == []
    assert hydrated["workbench_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert hydrated["workbench_state"]["raw_spec"]["ontology"]["metrics"][0]["time_dimension"] == "published_at"
    assert hydrated["workbench_state"]["advanced_refs"]["spec_available"] is True


def test_copilot_sandbox_preview_is_draft_only():
    service, _, _, _ = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    preview = service.sandbox(created["id"])

    assert preview["workbench_state"]["sandbox_preview"]["pollutes_official_route"] is False
    assert preview["workbench_state"]["agent_message"] == "已完成草稿态沙盒预演，不会污染正式 Data Agent runtime。"


def test_llm_adapter_raises_llm_required_when_api_key_missing(monkeypatch):
    """新版彻底删除 deterministic fallback：未配 LLM_API_KEY 时直接抛 LLMRequiredError，
    前端可据此引导用户去配置 LLM。"""
    import pytest

    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    session = AgentSession(id="session_1", user_goal="查询最近7天学生评论数，按学校汇总")

    class _UnusedTools:
        def execute(self, *args, **kwargs):
            raise AssertionError("LLM 未配置时不应触发任何工具调用")

    adapter = OpenAICompatibleLLMAdapter()
    with pytest.raises(LLMRequiredError) as exc_info:
        adapter.run(
            session=session,
            user_message="查询最近7天学生评论数，按学校汇总",
            tools=_UnusedTools(),
        )
    assert exc_info.value.reason == "missing_api_key"
    assert exc_info.value.code == "LLM_REQUIRED"


def test_llm_adapter_uses_fast_path_for_student_comment_without_llm(monkeypatch):
    """学生评论主场景已有候选表时，应直接生成 spec，避免首轮 LLM 超时。"""

    monkeypatch.setenv("LLM_API_KEY", "stub-key")

    class _Tools:
        def __init__(self):
            self.calls = []

        def execute(self, name, args, ctx):
            self.calls.append((name, args))
            if name == "search_ontology":
                return {"summary": "ontology", "objects": [], "metrics": []}
            if name == "search_cube":
                return {
                    "summary": "cubes",
                    "candidates": [
                        {"asset_type": "cube", "name": "student_comment_cube", "score": 0.82},
                        {
                            "asset_type": "table",
                            "name": "df_cb_258187.dwd_interaction_comment_reports_df",
                            "score": 0.78,
                        },
                    ],
                }
            if name == "build_evidence_pack":
                return {"summary": "evidence", "items": [{"id": "p1", "trust_level": "P1"}]}
            if name == "generate_semantic_draft":
                return {
                    "summary": "spec drafted",
                    "spec": {
                        "spec_version": "v1",
                        "cube": {"name": "student_comment_cube", "source": args.get("candidate_table")},
                        "ontology": {"object": {"name": "student_comment", "title": "学生评论"}},
                    },
                    "next_actions": {"default_publish_target": "cube_only"},
                }
            return {"summary": "noop"}

    class _ShouldNotCallOpenAI:
        def __init__(self, **_kw):
            raise AssertionError("fast path 不应调用 LLM")

    import openai

    monkeypatch.setattr(openai, "OpenAI", _ShouldNotCallOpenAI)

    session = AgentSession(id="s_fast", user_goal="查询最近 7 天学生评论数，按学校汇总")
    tools = _Tools()
    result = OpenAICompatibleLLMAdapter().run(session=session, user_message=session.user_goal, tools=tools)

    tool_names = [item[0] for item in tools.calls]
    assert tool_names == [
        "search_ontology",
        "search_cube",
        "build_evidence_pack",
        "generate_semantic_draft",
    ]
    assert tools.calls[-1][1]["candidate_table"] == "df_cb_258187.dwd_interaction_comment_reports_df"
    assert result.workbench_state_patch["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert result.workbench_state_patch["readiness"]["reasons"] == ["ready_to_save"]
    assert result.suggested_actions == ["run_validation", "save_proposal"]
    assert "llm.chat" not in [item.get("tool") for item in result.tool_traces]


def test_llm_adapter_invokes_deterministic_tools_then_calls_llm(monkeypatch):
    """LLM 配上后：先跑 search_ontology / search_cube / build_evidence_pack，
    再调 LLM；LLM 抽到 candidate_source_table 后再调 generate_semantic_draft。"""

    monkeypatch.setenv("LLM_API_KEY", "stub-key")
    monkeypatch.setenv("LLM_MODEL", "stub-model")

    class _Tools:
        def __init__(self):
            self.calls = []

        def execute(self, name, args, ctx):
            self.calls.append((name, args.get("table") or args.get("query")))
            if name == "search_ontology":
                return {"summary": "ontology", "objects": [], "metrics": []}
            if name == "search_cube":
                return {"summary": "cubes", "candidates": [{"name": "order_refund_cube", "score": 0.4}]}
            if name == "build_evidence_pack":
                return {"summary": "evidence", "items": []}
            if name == "generate_semantic_draft":
                return {
                    "summary": "spec drafted",
                    "spec": {
                        "spec_version": "v1",
                        "cube": {"name": "student_comment_cube", "source": args.get("table")},
                        "ontology": {"objects": [{"name": "student_comment", "title": "学生评论"}]},
                    },
                    "next_actions": {"default_publish_target": "cube_only"},
                }
            return {"summary": "noop"}

    captured: dict = {}

    class _FakeChoice:
        def __init__(self, payload):
            self.message = type("M", (), {"content": json.dumps(payload, ensure_ascii=False)})()

    class _FakeCompletion:
        def __init__(self, payload):
            self.choices = [_FakeChoice(payload)]

    class _FakeChatNs:
        def __init__(self, payload):
            self._payload = payload

        def create(self, **kw):
            captured["request"] = kw
            return _FakeCompletion(self._payload)

    class _FakeClient:
        def __init__(self, payload):
            self.chat = type("ChatNs", (), {})()
            self.chat.completions = _FakeChatNs(payload)

    payload = {
        "message": "我已识别建模目标。",
        "intent_summary": "学生评论数 × 学校",
        "candidate_source_table": "df.dwd_xxx",
        "need_source_table": False,
        "candidate_metrics": [
            {"name": "comment_count", "title": "学生评论数", "measure_ref_hint": "student_comment_cube.comment_count"},
        ],
        "candidate_dimensions": [{"name": "school_id", "title": "学校", "type": "string"}],
        "candidate_objects": [{"name": "student_comment", "title": "学生评论"}],
        "required_confirmations": [
            {"id": "confirm_school", "title": "学校字段", "recommended_value": "school_id", "blocking": True}
        ],
    }

    import openai

    monkeypatch.setattr(openai, "OpenAI", lambda **kw: _FakeClient(payload))

    session = AgentSession(id="s_test", user_goal="查询订单退款率")
    tools = _Tools()
    result = OpenAICompatibleLLMAdapter().run(session=session, user_message="先帮我看看", tools=tools)

    assert result.message == "我已识别建模目标。"
    # 工具调用顺序：search_ontology → search_cube → build_evidence_pack → generate_semantic_draft
    tool_names = [c[0] for c in tools.calls]
    assert tool_names == [
        "search_ontology",
        "search_cube",
        "build_evidence_pack",
        "generate_semantic_draft",
    ]
    # spec 已生成
    assert result.workbench_state_patch["raw_spec"]["cube"]["source"] == "df.dwd_xxx"
    # candidate_source_table 写到 advanced_refs 与 proposal_patch
    assert result.workbench_state_patch["advanced_refs"]["candidate_source_table"] == "df.dwd_xxx"
    assert result.proposal_patch["candidate_table"] == "df.dwd_xxx"
    # required_confirmations 透传
    assert result.required_confirmations[0]["id"] == "confirm_school"


def test_llm_adapter_skips_cube_generation_when_need_source_table(monkeypatch):
    """LLM 没识别到表名时，generate_semantic_draft 应被跳过，readiness 给 need_source_table 原因。"""

    monkeypatch.setenv("LLM_API_KEY", "stub-key")

    class _Tools:
        def __init__(self):
            self.calls = []

        def execute(self, name, args, ctx):
            self.calls.append(name)
            if name in {"search_ontology", "search_cube", "build_evidence_pack"}:
                return {"summary": name, "items": [], "candidates": [], "objects": [], "metrics": []}
            if name == "generate_semantic_draft":
                raise AssertionError("need_source_table=true 时不应触发 generate_semantic_draft")
            return {}

    payload = {
        "message": "请告诉我用哪张业务表",
        "intent_summary": "学生评论统计",
        "candidate_source_table": None,
        "need_source_table": True,
        "clarifying_question": "请告诉我用哪张业务表",
        "candidate_metrics": [],
        "candidate_dimensions": [],
        "candidate_objects": [],
        "required_confirmations": [],
    }

    class _Stub:
        def __init__(self, payload):
            self.chat = type("X", (), {})()
            self.chat.completions = type("Y", (), {"create": lambda *_a, **_k: type(
                "Z", (), {"choices": [type("C", (), {"message": type("M", (), {"content": json.dumps(payload, ensure_ascii=False)})()})]}
            )()})

    import openai

    monkeypatch.setattr(openai, "OpenAI", lambda **kw: _Stub(payload))

    session = AgentSession(id="s_test_2", user_goal="学生评论数统计")
    result = OpenAICompatibleLLMAdapter().run(session=session, user_message="g", tools=_Tools())

    assert "generate_semantic_draft" not in [c for c in (result.tool_traces[i].get("status") for i in range(len(result.tool_traces)))]
    assert result.workbench_state_patch["readiness"]["reasons"] == ["spec_not_generated", "need_source_table"]
    assert result.workbench_state_patch["advanced_refs"]["need_source_table"] is True
    assert result.suggested_actions == ["provide_source_table"]


def test_update_spec_replaces_raw_spec_and_recomputes_readiness():
    service, repo, _, _ = _service()
    created = service.create_session({"user_goal": "g"})
    # 先模拟 send_message 写一份 spec 进 raw_spec（用 _Runtime 已有的 patch）
    service.send_message(created["id"], {"message": "go"})
    # update_spec 用部分覆盖
    updated = service.update_spec(created["id"], {"cube": {"name": "student_comment_cube", "source": "dwd_x"}})
    assert updated["workbench_state"]["raw_spec"]["cube"]["name"] == "student_comment_cube"
    assert updated["workbench_state"]["agent_message"].startswith("已根据你的工作台编辑")
    # readiness 一定包含 reasons
    assert "reasons" in updated["workbench_state"]["readiness"]


def test_update_spec_full_replace_when_spec_key_provided():
    service, _, _, _ = _service()
    created = service.create_session({"user_goal": "g"})
    service.send_message(created["id"], {"message": "go"})
    new_spec = {"spec_version": "v1", "cube": {"name": "new_cube", "source": "dwd_y"}}
    updated = service.update_spec(created["id"], {"spec": new_spec})
    raw_spec = updated["workbench_state"]["raw_spec"]
    assert raw_spec["cube"]["name"] == "new_cube"
    assert raw_spec["cube"]["source"] == "dwd_y"
    assert raw_spec["cube"]["measures"]["total_count"]["certified"] is True
    assert raw_spec["ontology"]["metrics"][0]["binding_status"] == "approved"


def test_confirm_source_candidate_generates_spec_without_runtime():
    service, repo, runtime, _ = _service()
    created = service.create_session({"user_goal": "Data Agent 没听懂班级活跃度，帮我补语义"})
    session = repo.get(created["id"])
    session.workbench_state = {
        **session.workbench_state,
        "source_candidates": [
            {
                "id": "table:7:dw:dwd_class_activity_df",
                "asset_type": "table",
                "source_kind": "physical_table",
                "source_id": 7,
                "database": "dw",
                "table": "dwd_class_activity_df",
                "name": "dw.dwd_class_activity_df",
                "title": "班级活跃事实表",
            }
        ],
        "readiness": {
            "canonical_ready": False,
            "exploratory_ready": False,
            "reasons": ["source_candidate_confirmation_required", "spec_not_generated"],
        },
        "proposal_patch": {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": session.user_goal,
        },
    }
    repo.save(session)

    updated = service.send_message(
        created["id"],
        {
            "message": "使用这个来源：dw.dwd_class_activity_df",
            "action": "confirm_source_candidate",
            "candidate_id": "table:7:dw:dwd_class_activity_df",
        },
    )

    assert runtime.calls == []
    assert updated["workbench_state"]["advanced_refs"]["candidate_source_table"] == "dw.dwd_class_activity_df"
    assert updated["workbench_state"]["proposal_patch"]["source_kind"] == "physical_table"
    assert updated["workbench_state"]["proposal_patch"]["source_id"] == 7
    assert updated["workbench_state"]["proposal_patch"]["database"] == "dw"
    assert updated["workbench_state"]["proposal_patch"]["table"] == "dwd_class_activity_df"
    assert updated["workbench_state"]["readiness"]["reasons"] == ["ready_to_save"]
    assert updated["workbench_state"]["raw_spec"]["spec_version"] == "v1"


def test_student_comment_source_confirmation_repairs_latest_answer_view_regression():
    class _EchoDraftTools(_Tools):
        def execute(self, tool_name, arguments, context):
            self.calls.append((tool_name, arguments))
            if tool_name != "generate_semantic_draft":
                return super().execute(tool_name, arguments, context)
            state = (context.get("session") or {}).get("workbench_state") or {}
            patch = state.get("proposal_patch") or {}
            table = str(
                arguments.get("table")
                or arguments.get("candidate_table")
                or patch.get("candidate_table")
                or ""
            )
            cube_name = table.split(".")[-1] if table else "unknown_source"
            return {
                "summary": f"已基于 {table} 生成 spec",
                "spec": {
                    "spec_version": "v1",
                    "source": {
                        "source_kind": arguments.get("source_kind") or patch.get("source_kind"),
                        "source_id": arguments.get("source_id") or patch.get("source_id"),
                        "database": arguments.get("database") or patch.get("database"),
                        "table": arguments.get("table") or patch.get("table"),
                    },
                    "business": {"subject": "学生评论", "sensitivity_level": "restricted"},
                    "cube": {
                        "name": cube_name,
                        "source": table,
                        "table": cube_name,
                        "dimensions": {
                            "comment_school_name": {"title": "学校", "type": "string"},
                            "comment_published_at": {"title": "发布时间", "type": "time"},
                            "report_id": {"title": "举报ID", "type": "number", "primary_key": True},
                        },
                        "measures": {
                            "total_count": {
                                "title": "学生评论数",
                                "type": "count",
                                "sql": "COUNT(`report_id`)",
                                "certified": True,
                            }
                        },
                    },
                    "ontology": {"object": {"name": "student_comment", "title": "学生评论"}, "metrics": []},
                },
            }

    repo = _SessionRepository()
    runtime = _Runtime()
    tools = _EchoDraftTools()
    proposals = _ProposalService()
    service = SemanticModelingCopilotService(
        session_repository=repo,
        runtime=runtime,
        tools=tools,
        proposal_service=proposals,
    )
    created = service.create_session({"user_goal": "查询最近 7 天学生评论数，按学校汇总"})
    session = repo.get(created["id"])
    session.workbench_state = {
        **session.workbench_state,
        "source_candidates": [
            {
                "id": "dataset:48",
                "asset_type": "dataset",
                "source_kind": "dataset",
                "source_id": 1,
                "dataset_id": 48,
                "database": None,
                "schema": None,
                "table": "",
                "name": "view_student_answer_analysis",
                "title": "学生答题分析视图",
                "matched_terms": ["学生", "学校", "student"],
            }
        ],
        "readiness": {
            "canonical_ready": False,
            "exploratory_ready": False,
            "reasons": ["source_candidate_confirmation_required", "spec_not_generated"],
        },
        "proposal_patch": {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": session.user_goal,
            "candidate_assets": [
                {"name": "view_student_answer_analysis", "asset_type": "dataset"},
            ],
        },
    }
    repo.save(session)

    updated = service.send_message(
        created["id"],
        {
            "message": "使用这个来源：view_student_answer_analysis",
            "action": "confirm_source_candidate",
            "candidate_id": "dataset:48",
        },
    )
    saved = service.save_proposal(updated["id"])

    state = saved["workbench_state"]
    spec = state["raw_spec"]
    assert runtime.calls == []
    assert state["proposal_patch"]["source_kind"] == "physical_table"
    assert state["proposal_patch"]["candidate_table"] == "df_cb_258187.dwd_interaction_comment_reports_df"
    assert state["advanced_refs"]["candidate_source_table"] == "df_cb_258187.dwd_interaction_comment_reports_df"
    assert spec["cube"]["name"] == "dwd_interaction_comment_reports_df"
    assert spec["cube"]["table"] == "dwd_interaction_comment_reports_df"
    assert spec["ontology"]["metrics"][0]["measure_refs"] == [
        "dwd_interaction_comment_reports_df.total_count"
    ]
    assert "view_student_answer_analysis" not in json.dumps(
        proposals.payloads[0]["embedded_spec"], ensure_ascii=False
    )


def test_student_comment_golden_case_confirm_source_save_and_publish():
    service, repo, runtime, proposals = _service()
    created = service.create_session({"user_goal": "查询最近 7 天学生评论数，按学校汇总"})
    session = repo.get(created["id"])
    session.workbench_state = {
        **session.workbench_state,
        "source_candidates": [
            {
                "id": "table:1:df_cb_258187:dwd_interaction_comment_reports_df",
                "asset_type": "table",
                "source_kind": "physical_table",
                "source_id": 1,
                "database": "df_cb_258187",
                "table": "dwd_interaction_comment_reports_df",
                "name": "df_cb_258187.dwd_interaction_comment_reports_df",
                "title": "学生评论举报明细事实表",
                "score": 0.99,
                "confidence": "high",
                "why_selected": "综合得分最高：命中学生评论/举报事实域。",
            }
        ],
        "readiness": {
            "canonical_ready": False,
            "exploratory_ready": False,
            "reasons": ["source_candidate_confirmation_required", "spec_not_generated"],
        },
        "proposal_patch": {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": session.user_goal,
        },
    }
    repo.save(session)

    confirmed = service.send_message(
        created["id"],
        {
            "message": "使用这个来源：df_cb_258187.dwd_interaction_comment_reports_df",
            "action": "confirm_source_candidate",
            "candidate_id": "table:1:df_cb_258187:dwd_interaction_comment_reports_df",
        },
    )
    saved = service.save_proposal(confirmed["id"])
    published = service.publish_proposal(saved["id"])

    assert runtime.calls == []
    assert proposals.calls == ["create", "draft", "validate", "approve", "apply", "publish"]
    assert saved["workbench_state"]["raw_spec"]["cube"]["table"] == "dwd_interaction_comment_reports_df"
    assert proposals.payloads[0]["embedded_spec"]["cube"]["table"] == "dwd_interaction_comment_reports_df"
    assert published["state"] == "published"
    assert published["workbench_state"]["publish_result"]["status"] == "published"


# ---------------------------------------------------------------------------
# Session list / delete / rename + principal 隔离
# ---------------------------------------------------------------------------


def test_create_session_records_principal_id_and_title():
    service, repo, _, _ = _service()
    created = service.create_session(
        {"user_goal": "查询最近7天学生评论数", "principal_id": "alice", "title": "评论数草稿"}
    )
    assert created["principal_id"] == "alice"
    assert created["title"] == "评论数草稿"
    stored = repo.get(created["id"])
    assert stored.principal_id == "alice"
    assert stored.title == "评论数草稿"


def test_list_sessions_filters_by_principal_and_keeps_legacy_visible():
    service, repo, _, _ = _service()
    s_alice = service.create_session(
        {"user_goal": "alice goal", "principal_id": "alice"}
    )
    s_bob = service.create_session(
        {"user_goal": "bob goal", "principal_id": "bob"}
    )
    s_legacy = service.create_session({"user_goal": "legacy goal"})  # 无 principal_id

    listed_alice = service.list_sessions(principal_id="alice")
    ids = {item["id"] for item in listed_alice["items"]}
    assert s_alice["id"] in ids
    assert s_legacy["id"] in ids  # legacy 默认全员可见
    assert s_bob["id"] not in ids

    listed_alice_strict = service.list_sessions(principal_id="alice", include_legacy=False)
    ids_strict = {item["id"] for item in listed_alice_strict["items"]}
    assert s_legacy["id"] not in ids_strict
    assert s_alice["id"] in ids_strict

    # 管理员视角（不指定 principal_id）能看全
    listed_all = service.list_sessions(principal_id=None)
    assert {item["id"] for item in listed_all["items"]} == {
        s_alice["id"], s_bob["id"], s_legacy["id"]
    }


def test_list_sessions_supports_status_filter():
    service, repo, _, _ = _service()
    s = service.create_session({"user_goal": "a goal", "principal_id": "alice"})
    stored = repo.get(s["id"])
    stored.status = "abandoned"
    repo.save(stored)

    active_only = service.list_sessions(principal_id="alice", status="active")
    assert s["id"] not in {item["id"] for item in active_only["items"]}

    abandoned_only = service.list_sessions(principal_id="alice", status="abandoned")
    assert s["id"] in {item["id"] for item in abandoned_only["items"]}


def test_delete_session_authorizes_owner_and_is_idempotent():
    service, repo, _, _ = _service()
    s = service.create_session({"user_goal": "alice goal", "principal_id": "alice"})

    import pytest

    with pytest.raises(PermissionError):
        service.delete_session(s["id"], principal_id="bob")

    deleted = service.delete_session(s["id"], principal_id="alice")
    assert deleted == {"deleted": True, "id": s["id"]}
    assert repo.get(s["id"]) is None

    # 幂等
    again = service.delete_session(s["id"], principal_id="alice")
    assert again == {"deleted": False, "id": s["id"]}


def test_delete_session_legacy_session_visible_to_all():
    service, repo, _, _ = _service()
    s = service.create_session({"user_goal": "legacy"})  # 无 principal_id
    deleted = service.delete_session(s["id"], principal_id="alice")
    assert deleted == {"deleted": True, "id": s["id"]}


def test_publish_proposal_chains_approve_apply_publish_after_save():
    service, _, _, proposals = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    service.send_message(created["id"], {"message": "生成学生评论语义"})
    service.confirm(created["id"], {"confirmation_id": "confirm_school_dimension", "value": "school_id"})
    saved = service.save_proposal(created["id"])
    assert saved["current_proposal_id"] == "proposal_1"

    published = service.publish_proposal(created["id"])

    # 验证三联调按顺序执行
    assert proposals.calls[-3:] == ["approve", "apply", "publish"]
    assert published["status"] == "completed"
    assert published["workbench_state"]["publish_result"]["status"] == "published"
    assert published["workbench_state"]["publish_result"]["proposal_id"] == "proposal_1"
    assert published["workbench_state"]["readiness"]["canonical_ready"] is True
    assert published["workbench_state"]["readiness"]["reasons"] == []
    # 用户能看到 active 资产指示
    assert published["workbench_state"]["publish_result"]["details"]["cube"]["status"] == "active"


def test_publish_proposal_recovers_legacy_draft_by_validating_before_approve():
    service, _, _, proposals = _service(proposal_service=_ApprovalRequiresValidationProposalService())
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    service.send_message(created["id"], {"message": "生成学生评论语义"})
    service.confirm(created["id"], {"confirmation_id": "confirm_school_dimension", "value": "school_id"})
    saved = service.save_proposal(created["id"])
    proposals.validated.clear()
    assert saved["current_proposal_id"] == "proposal_1"

    published = service.publish_proposal(created["id"])

    assert proposals.calls[-4:] == ["validate", "approve", "apply", "publish"]
    assert published["workbench_state"]["publish_result"]["status"] == "published"


def test_publish_proposal_requires_saved_proposal():
    import pytest

    service, _, _, _ = _service()
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    service.send_message(created["id"], {"message": "生成学生评论语义"})

    with pytest.raises(ValueError, match="还没保存"):
        service.publish_proposal(created["id"])


def test_publish_proposal_persists_publish_failure_for_review():
    import pytest

    service, repo, _, proposals = _service(proposal_service=_DriftProposalService())
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    service.send_message(created["id"], {"message": "生成学生评论语义"})
    service.confirm(created["id"], {"confirmation_id": "confirm_school_dimension", "value": "school_id"})
    service.save_proposal(created["id"])

    with pytest.raises(ValueError, match="semantic_diff"):
        service.publish_proposal(created["id"])

    saved = repo.get(created["id"])
    state = saved.workbench_state
    assert proposals.calls[-2:] == ["approve", "apply"]
    assert state["publish_result"]["status"] == "failed"
    assert state["publish_result"]["reason"] == "approved_semantic_diff_drift"
    assert "approved_semantic_diff_drift" in state["readiness"]["reasons"]
    assert "已批准差异和应用资产不一致" in state["agent_message"]
    assert "重新应用语义" in saved.conversation[-1].content


def test_publish_proposal_explains_validation_blocked_instead_of_generic_failure():
    import pytest

    service, repo, _, proposals = _service(proposal_service=_PublishValidationBlockedProposalService())
    created = service.create_session({"user_goal": "查询最近7天学生评论数，按学校汇总"})
    service.send_message(created["id"], {"message": "生成学生评论语义"})
    service.confirm(created["id"], {"confirmation_id": "confirm_school_dimension", "value": "school_id"})
    service.save_proposal(created["id"])

    with pytest.raises(ValueError, match="Proposal validation blocked before approved"):
        service.publish_proposal(created["id"])

    saved = repo.get(created["id"])
    state = saved.workbench_state
    assert proposals.calls[-2:] == ["approve", "validate"]
    assert state["publish_result"]["status"] == "failed"
    assert state["publish_result"]["reason"] == "proposal_validation_blocked"
    assert "proposal_validation_blocked" in state["readiness"]["reasons"]
    assert "Proposal 校验未通过" in state["agent_message"]


def test_rename_session_updates_title_and_authorizes():
    service, repo, _, _ = _service()
    s = service.create_session(
        {"user_goal": "alice goal", "principal_id": "alice", "title": "旧标题"}
    )

    import pytest

    with pytest.raises(PermissionError):
        service.rename_session(s["id"], {"title": "其他人改"}, principal_id="bob")

    renamed = service.rename_session(s["id"], {"title": "新标题"}, principal_id="alice")
    assert renamed["title"] == "新标题"

    # title 缺省必须报错
    with pytest.raises(ValueError):
        service.rename_session(s["id"], {}, principal_id="alice")


def test_principal_owned_session_blocks_cross_user_read_and_write_paths():
    import pytest

    service, _, _, _ = _service()
    created = service.create_session(
        {"user_goal": "查询最近7天学生评论数，按学校汇总", "principal_id": "alice"}
    )

    blocked_calls = [
        lambda: service.get_session(created["id"], principal_id="bob"),
        lambda: service.get_review(created["id"], principal_id="bob"),
        lambda: service.send_message(created["id"], {"message": "继续建模"}, principal_id="bob"),
        lambda: service.confirm(
            created["id"],
            {"confirmation_id": "confirm_school_dimension", "value": "school_id"},
            principal_id="bob",
        ),
        lambda: service.accept_cube_draft(created["id"], {}, principal_id="bob"),
        lambda: service.sandbox(created["id"], {}, principal_id="bob"),
        lambda: service.update_spec(created["id"], {"cube": {"name": "bob_cube"}}, principal_id="bob"),
        lambda: service.save_proposal(created["id"], {}, principal_id="bob"),
        lambda: service.publish_proposal(created["id"], {}, principal_id="bob"),
    ]

    for call in blocked_calls:
        with pytest.raises(PermissionError, match="属于其他用户"):
            call()


def test_legacy_session_without_principal_remains_accessible_to_authenticated_principals():
    service, _, _, _ = _service()
    legacy = service.create_session({"user_goal": "legacy session"})

    assert service.get_session(legacy["id"], principal_id="alice")["id"] == legacy["id"]
    assert service.get_review(legacy["id"], principal_id="bob")["session_id"] == legacy["id"]
    renamed = service.rename_session(legacy["id"], {"title": "旧会话认领前可维护"}, principal_id="bob")
    assert renamed["title"] == "旧会话认领前可维护"
