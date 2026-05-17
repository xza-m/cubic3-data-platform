from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.application.semantic.modeling_proposal_service import ModelingProposalService
from app.application.semantic.publish_readiness_checker import PublishReadinessChecker
from app.domain.semantic.modeling_proposal import ModelingProposal


def _spec(status: str = "draft"):
    return {
        "spec_version": "v1",
        "source": {
            "source_kind": "physical_table",
            "source_id": 7,
            "database": "dw",
            "table": "dwd_student_comment_events",
        },
        "business": {
            "subject": "学生评论",
            "sensitivity_level": "restricted",
            "default_roles": ["teacher_ops"],
        },
        "cube": {
            "name": "student_comments",
            "status": status,
            "default_time_dimension": "comment_time",
            "dimensions": {
                "comment_time": {"title": "评论时间", "type": "time", "sql": "`comment_time`"},
                "school_id": {"title": "学校", "type": "string", "sql": "`school_id`"},
            },
            "measures": {
                "total_count": {
                    "title": "总数",
                    "type": "count",
                    "sql": "COUNT(`comment_id`)",
                    "certified": True,
                    "additivity": "additive",
                }
            },
        },
        "ontology": {
            "object": {"name": "student_comment", "status": status},
            "metrics": [
                {
                    "name": "student_comment_total_count",
                    "status": status,
                    "measure_refs": ["student_comments.total_count"],
                    "binding_status": "approved",
                    "grain": "school_day",
                    "time_dimension": "comment_time",
                    "additivity": "additive",
                }
            ],
            "glossary": [],
            "policies": [
                {
                    "name": "student_comment_total_count_policy",
                    "status": status,
                    "visibility": "restricted",
                }
            ],
        },
        "governance": {
            "sensitivity_level": "restricted",
            "sensitive_fields": ["comment_content"],
        },
        "evidence_pack": {
            "items": [
                {
                    "id": "cube-total-count",
                    "type": "certified_cube",
                    "trust_level": "P0",
                    "source_uri": "semantic://cubes/student_comments",
                    "observed_at": "2026-05-01T00:00:00Z",
                    "valid_until": "2099-01-01T00:00:00Z",
                    "owner": "semantic_owner",
                    "claim_key": "metric.comment_count",
                    "extracted_claim": "student_comments.total_count",
                }
            ]
        },
    }


class _MemoryProposalRepository:
    def __init__(self):
        self.items = {}

    def save(self, proposal: ModelingProposal) -> None:
        self.items[proposal.id] = proposal

    def get(self, proposal_id: str):
        return self.items.get(proposal_id)


class _Builder:
    def __init__(self):
        self.spec = _spec()
        self.calls = []

    def create_spec_draft(self, payload):
        self.calls.append(("spec_draft", payload))
        return {"spec": deepcopy(self.spec), "next_actions": {"default_publish_target": "cube_only"}}

    def draft_from_spec(self, spec):
        self.calls.append(("draft_from_spec", spec))
        return {
            "cube": deepcopy(spec["cube"]),
            "ontology": deepcopy(spec["ontology"]),
            "published": False,
            "diff": {"source": "user_confirmed_spec", "has_user_editable_spec": True},
        }

    def validate(self, spec):
        self.calls.append(("validate", spec))
        refs = spec["ontology"]["metrics"][0].get("measure_refs") or []
        if refs == ["student_comments.total_count"]:
            return {"status": "ready", "issues": [], "checks": {"metric_binding": "passed"}}
        return {
            "status": "blocked",
            "issues": [{"severity": "error", "path": "metric.measure_refs", "message": "无法解析 Measure 引用"}],
            "checks": {"metric_binding": "failed"},
        }

    def apply(self, spec):
        self.calls.append(("apply", spec))
        return {"published": False, "assets": {"cube": {"name": spec["cube"]["name"]}}, "spec": spec}

    def publish(self, spec, publish_targets=None):
        self.calls.append(("publish", spec, publish_targets))
        return {"publish_targets": publish_targets or {"cube": True, "ontology": False}}


def _service(builder=None):
    return ModelingProposalService(
        repository=_MemoryProposalRepository(),
        builder=builder or _Builder(),
        readiness_checker=PublishReadinessChecker(),
    )


def test_proposal_flow_wraps_existing_builder_and_computes_readiness():
    service = _service()

    created = service.create_proposal(
        {
            "source_mode": "human_led",
            "source_kind": "physical_table",
            "source_id": 7,
            "table": "dwd_student_comment_events",
            "business_subject": "学生评论",
            "sensitivity_level": "restricted",
        }
    )
    assert created["status"] == "created"

    drafted = service.draft(created["id"])
    assert drafted["status"] == "drafted"
    assert drafted["spec"]["cube"]["name"] == "student_comments"
    assert drafted["semantic_diff"]["source"] == "user_confirmed_spec"

    validated = service.validate(created["id"])
    assert validated["status"] == "validated"
    assert validated["readiness_label"] == "Save Draft Only"
    assert validated["coverage_result"]["binding_coverage"] == "linked"
    assert validated["runtime_consumption_result"]["computed_by"] == "publish_readiness_checker"
    assert validated["runtime_consumption_result"]["canonical_ready"] is False
    assert "cube_not_active" in validated["runtime_consumption_result"]["reasons"]

    approved = service.approve(created["id"], {"approved_by": "semantic_owner"})
    assert approved["status"] == "approved"
    assert approved["approved_spec_hash"]
    assert approved["audit_snapshot"]["approved_spec_hash"] == approved["approved_spec_hash"]

    applied = service.apply(created["id"])
    assert applied["status"] == "applied"
    assert applied["applied_spec_hash"] == approved["approved_spec_hash"]
    assert applied["audit_snapshot"]["applied_spec_hash"] == approved["approved_spec_hash"]


def test_draft_uses_embedded_spec_skips_create_spec_draft_for_copilot_business_question():
    """Copilot：request_payload 仍为 business_question，但附带完整 embedded_spec 时，
    draft 必须直接使用该 spec，不得再调 create_spec_draft（否则会报不支持的建模源类型）。"""

    class _NoRebuildBuilder(_Builder):
        def create_spec_draft(self, payload):
            raise AssertionError("embedded_spec 存在时不应再次 create_spec_draft")

    service = _service(builder=_NoRebuildBuilder())
    embedded = deepcopy(_spec())
    created = service.create_proposal(
        {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": "查询最近7天学生评论数，按学校汇总",
            "business_subject": "学生评论",
            "embedded_spec": embedded,
        }
    )
    drafted = service.draft(created["id"])
    assert drafted["status"] == "drafted"
    assert drafted["spec"]["cube"]["name"] == "student_comments"
    assert drafted["spec"]["spec_version"] == "v1"


def test_gap_view_projects_proposal_into_business_first_view_model():
    service = _service()

    created = service.create_proposal(
        {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": "查询最近7天学生评论数，按学校汇总",
            "business_subject": "学生评论",
        }
    )
    service.draft(created["id"])
    service.validate(created["id"])

    view = service.get_gap_view(created["id"])

    assert view["id"] == created["id"]
    assert view["question"]["text"] == "查询最近7天学生评论数，按学校汇总"
    assert view["primary_action"] == {
        "label": "确认变更",
        "action": "approve",
        "disabled": False,
        "tone": "primary",
    }
    assert view["gaps"][0]["title"] == "当前语义还不能直接回答"
    assert any(item["title"] == "学生评论总数" for item in view["patch_plan"])
    assert any(item["type"] == "metric" for item in view["technical_change"]["changed_objects"])
    assert view["technical_change"]["approval_wording"] == "变更确认"
    assert "approval" not in view["primary_action"]["action"]


def test_gap_view_projects_blockers_into_repair_patch_plan_when_assets_are_missing():
    class _BrokenAssetBuilder(_Builder):
        def __init__(self):
            super().__init__()
            self.spec = {
                "spec_version": "v1",
                "business": {"subject": "学生评论", "sensitivity_level": "restricted"},
                "cube": {},
                "ontology": {"object": {}, "metrics": [], "glossary": [], "policies": []},
            }

        def validate(self, spec):
            self.calls.append(("validate", spec))
            return {
                "status": "blocked",
                "issues": [
                    {
                        "severity": "error",
                        "code": "cube_name_missing",
                        "path": "cube.name",
                        "message": "Cube 缺少 name，无法保存建模草稿",
                    },
                    {
                        "severity": "error",
                        "code": "cube_measure_missing",
                        "path": "cube.measures",
                        "message": "Cube 缺少 measure，无法发布指标语义",
                    },
                ],
            }

    service = _service(_BrokenAssetBuilder())
    created = service.create_proposal(
        {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": "查询最近7天学生评论数，按学校汇总",
            "business_subject": "学生评论",
        }
    )
    service.draft(created["id"])
    service.validate(created["id"])

    view = service.get_gap_view(created["id"])

    assert view["status"] == "blocked"
    assert view["patch_plan"]
    assert {item["title"] for item in view["patch_plan"]} >= {"补充语义模型名称", "补充指标计算口径"}


def test_validate_blocks_when_metric_binding_is_missing():
    builder = _Builder()
    builder.spec["ontology"]["metrics"][0]["measure_refs"] = ["student_comments.missing_count"]
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    assert result["status"] == "blocked"
    assert result["coverage_result"]["binding_coverage"] == "missing"
    assert any(issue["severity"] == "error" for issue in result["validation_matrix"]["blockers"])


def test_validate_blocks_when_binding_is_not_approved_for_runtime():
    builder = _Builder()
    builder.spec["ontology"]["metrics"][0]["binding_status"] = "proposed"
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "human_led", "user_question": "最近7天评论数"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    assert result["status"] == "blocked"
    assert result["coverage_result"]["binding_status"] == "proposed"
    assert "binding_not_approved" in result["runtime_consumption_result"]["reasons"]
    assert any(issue["code"] == "binding_lifecycle_not_approved" for issue in result["validation_matrix"]["blockers"])


def test_validate_blocks_metric_without_grain_time_dimension_or_additivity():
    builder = _Builder()
    metric = builder.spec["ontology"]["metrics"][0]
    metric.pop("grain")
    metric.pop("time_dimension")
    metric.pop("additivity")
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    blocker_codes = {issue["code"] for issue in result["validation_matrix"]["blockers"]}
    assert {"metric_grain_missing", "metric_time_dimension_missing", "metric_additivity_missing"} <= blocker_codes


def test_validate_repairs_agent_led_student_comment_runtime_contract_before_blocking():
    builder = _Builder()
    metric = builder.spec["ontology"]["metrics"][0]
    metric.pop("grain")
    metric.pop("time_dimension")
    metric.pop("additivity")
    metric["binding_status"] = "proposed"
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "agent_led", "user_question": "最近7天学生评论数按学校汇总"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    repaired_metric = result["spec"]["ontology"]["metrics"][0]
    assert result["status"] == "validated"
    assert repaired_metric["grain"] == "school_id,comment_time"
    assert repaired_metric["time_dimension"] == "comment_time"
    assert repaired_metric["additivity"] == "additive"
    assert repaired_metric["binding_status"] == "approved"


def test_validate_blocks_p3_only_and_expired_high_trust_evidence():
    builder = _Builder()
    builder.spec["evidence_pack"]["items"] = [
        {
            "id": "llm-guess",
            "type": "llm_inference",
            "trust_level": "P3",
            "source_uri": "agent://draft",
            "observed_at": "2026-05-01T00:00:00Z",
            "valid_until": "2099-01-01T00:00:00Z",
            "owner": "agent",
            "claim_key": "metric.comment_count",
            "extracted_claim": "student_comments.total_count",
        },
        {
            "id": "old-owner-doc",
            "type": "owner_doc",
            "trust_level": "P1",
            "source_uri": "doc://old",
            "observed_at": "2024-01-01T00:00:00Z",
            "valid_until": "2024-12-31T00:00:00Z",
            "owner": "semantic_owner",
            "claim_key": "metric.comment_count",
            "extracted_claim": "student_comments.total_count",
        },
    ]
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "agent_led", "user_question": "评论数"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    blocker_codes = {issue["code"] for issue in result["validation_matrix"]["blockers"]}
    assert "evidence_trust_too_low" in blocker_codes
    assert "evidence_expired" in blocker_codes


def test_validate_blocks_conflicting_p0_p1_evidence():
    builder = _Builder()
    builder.spec["evidence_pack"]["items"] = [
        {
            "id": "cube-count",
            "type": "certified_cube",
            "trust_level": "P0",
            "source_uri": "semantic://cube",
            "observed_at": "2026-05-01T00:00:00Z",
            "valid_until": "2099-01-01T00:00:00Z",
            "owner": "semantic_owner",
            "claim_key": "metric.comment_count",
            "extracted_claim": "student_comments.total_count",
        },
        {
            "id": "owner-doc",
            "type": "owner_doc",
            "trust_level": "P1",
            "source_uri": "doc://metric",
            "observed_at": "2026-05-01T00:00:00Z",
            "valid_until": "2099-01-01T00:00:00Z",
            "owner": "semantic_owner",
            "claim_key": "metric.comment_count",
            "extracted_claim": "student_comments.approved_count",
        },
    ]
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "agent_led", "user_question": "评论数"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    assert any(issue["code"] == "evidence_conflict" for issue in result["validation_matrix"]["blockers"])


def test_draft_closes_covered_proposal_without_generating_new_assets():
    builder = _Builder()
    builder.spec["coverage"] = {
        "ontology_score": 0.91,
        "cube_score": 0.87,
        "binding_status": "approved",
        "policy_status": "valid",
        "reusable_assets": ["metric:student_comment_total_count"],
    }
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "agent_led", "user_question": "最近7天评论数"})
    result = service.draft(proposal["id"])

    assert result["status"] == "closed"
    assert result["close_reason"] == "reused_existing"
    assert result["readiness_label"] == "Covered by Existing Semantics"
    assert result["coverage_result"]["decision"] == "covered"
    assert [call[0] for call in builder.calls] == ["spec_draft"]


def test_close_rejects_or_abandons_open_proposal_with_audit_record():
    service = _service()
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})

    result = service.close(
        proposal["id"],
        {"close_reason": "rejected", "actor": "semantic_owner", "comment": "口径不一致"},
    )

    assert result["status"] == "closed"
    assert result["close_reason"] == "rejected"
    assert result["review_records"][-1]["action"] == "close"
    assert result["review_records"][-1]["actor"] == "semantic_owner"


def test_apply_requires_approved_proposal():
    service = _service()
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])

    with pytest.raises(ValueError, match="approved"):
        service.apply(proposal["id"])


def test_apply_allows_builder_to_enrich_persisted_assets_after_approval():
    class EnrichingBuilder(_Builder):
        def apply(self, spec):
            result = super().apply(spec)
            enriched = deepcopy(spec)
            enriched["cube"]["status"] = "draft"
            enriched["cube"]["created_at"] = "2026-05-12T00:00:00Z"
            result["spec"] = enriched
            return result

    service = _service(EnrichingBuilder())
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])
    approved = service.approve(proposal["id"], {"approved_by": "semantic_owner"})

    applied = service.apply(proposal["id"])

    assert applied["status"] == "applied"
    assert applied["spec"]["cube"]["created_at"] == "2026-05-12T00:00:00Z"
    assert applied["audit_snapshot"]["approved_spec_hash"] == approved["approved_spec_hash"]


def test_apply_blocks_when_approved_spec_changes_before_apply():
    service = _service()
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])
    service.approve(proposal["id"], {"approved_by": "semantic_owner"})

    stored = service._repository.get(proposal["id"])
    stored.spec["cube"]["name"] = "unexpected_cube"

    with pytest.raises(ValueError, match="Approved spec changed before apply"):
        service.apply(proposal["id"])


def test_readiness_accepts_active_cube_ontology_and_policy():
    checker = PublishReadinessChecker()
    result = checker.evaluate(_spec(status="active"))

    assert result["computed_by"] == "publish_readiness_checker"
    assert result["canonical_ready"] is True
    assert result["reasons"] == []


def test_published_ready_proposal_exposes_backend_readiness_label():
    builder = _Builder()
    builder.spec = _spec(status="active")
    service = _service(builder)
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])

    result = service.get_proposal(proposal["id"])

    assert result["readiness_label"] == "Can Publish"
