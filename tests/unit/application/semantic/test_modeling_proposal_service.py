from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.application.semantic.modeling_proposal_service import ModelingProposalService
from app.application.semantic.modeling_validation_matrix import ValidationMatrixBuilder
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
            "object": {
                "name": "student_comment",
                "status": status,
                "cube_bindings": [
                    {"cube": "student_comments", "role": "primary", "entity_key": "school_id"}
                ],
            },
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
        return {"spec": deepcopy(self.spec), "next_actions": {"default_publish_target": "cube_and_ontology"}}

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
        from app.domain.ontology.entities import measure_ref_strings

        refs = measure_ref_strings(spec["ontology"]["metrics"][0].get("measure_refs"))
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


class _SqlRegistryRepository:
    def __init__(self):
        self.assets = {}
        self.revisions = {}
        self.active_snapshot = None

    def get_asset(self, namespace, asset_type, asset_key):
        return self.assets.get((namespace, asset_type, asset_key))

    def get_asset_by_id(self, asset_id):
        return next((asset for asset in self.assets.values() if asset.id == asset_id), None)

    def create_or_update_asset(self, asset):
        self.assets[(asset.namespace, asset.asset_type, asset.asset_key)] = asset
        return asset

    def append_revision(self, asset_id, spec, *, proposal_id=None, actor=None, force_new_revision=False):
        revision = SimpleNamespace(
            id=f"rev_{len(self.revisions) + 1}",
            asset_id=asset_id,
            revision_no=len([item for item in self.revisions.values() if item.asset_id == asset_id]) + 1,
            revision_status="draft",
            spec_json=deepcopy(spec),
            spec_checksum=f"sha-{len(self.revisions) + 1}",
            proposal_id=proposal_id,
            created_by=actor,
        )
        self.revisions[revision.id] = revision
        asset = self.get_asset_by_id(asset_id)
        asset.current_revision_id = revision.id
        return revision

    def get_revision(self, revision_id):
        return self.revisions.get(revision_id)

    def get_active_snapshot(self, namespace="default"):
        return self.active_snapshot


class _SqlReleaseService:
    def __init__(self, repo):
        self.repo = repo
        self.calls = []

    def publish(self, *, namespace, revision_ids, actor, gate_result, idempotency_key=None):
        self.calls.append(
            {
                "namespace": namespace,
                "revision_ids": list(revision_ids),
                "actor": actor,
                "gate_result": deepcopy(gate_result),
                "idempotency_key": idempotency_key,
            }
        )
        release = SimpleNamespace(
            id=f"rel_{len(self.calls)}",
            release_no=len(self.calls),
            status="published",
            namespace=namespace,
        )
        for revision_id in revision_ids:
            revision = self.repo.get_revision(revision_id)
            asset = self.repo.get_asset_by_id(revision.asset_id)
            asset.status = "active"
            asset.current_release_id = release.id
        self.repo.active_snapshot = SimpleNamespace(id=f"snap_{len(self.calls)}")
        return release


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


def test_proposal_approve_is_idempotent_for_same_revision():
    service = _service()
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])

    first = service.approve(proposal["id"], {"approved_by": "semantic_owner"})
    second = service.approve(proposal["id"], {"approved_by": "semantic_owner"})

    assert first["approved_spec_hash"] == second["approved_spec_hash"]
    assert len(second["review_records"]) == 1
    assert [
        action["action"]
        for action in second["action_log"]
        if action["action"] == "approve"
    ] == ["approve"]


def test_proposal_apply_and_publish_are_idempotent_after_success():
    builder = _Builder()
    service = _service(builder)
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])
    service.approve(proposal["id"], {"approved_by": "semantic_owner"})

    first_apply = service.apply(proposal["id"])
    second_apply = service.apply(proposal["id"])
    first_publish = service.publish(proposal["id"], publish_targets={"cube": True, "ontology": False})
    second_publish = service.publish(proposal["id"], publish_targets={"cube": True, "ontology": False})

    assert first_apply["applied_spec_hash"] == second_apply["applied_spec_hash"]
    assert first_publish["publish_result"] == second_publish["publish_result"]
    assert [call[0] for call in builder.calls].count("apply") == 1
    assert [call[0] for call in builder.calls].count("publish") == 1
    assert [
        action["action"]
        for action in second_publish["action_log"]
        if action["action"] in {"apply", "publish"}
    ] == ["apply", "publish"]


def test_apply_and_publish_use_sql_registry_when_available():
    builder = _Builder()
    registry = _SqlRegistryRepository()
    release_service = _SqlReleaseService(registry)
    service = ModelingProposalService(
        repository=_MemoryProposalRepository(),
        builder=builder,
        readiness_checker=PublishReadinessChecker(),
        asset_registry_repository=registry,
        release_service=release_service,
    )
    proposal = service.create_proposal({"source_mode": "agent_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])
    service.approve(proposal["id"], {"approved_by": "semantic_owner"})

    applied = service.apply(proposal["id"])
    published = service.publish(proposal["id"], publish_targets={"cube": True, "ontology": True})

    assert [call[0] for call in builder.calls].count("apply") == 0
    assert [call[0] for call in builder.calls].count("publish") == 0
    assert applied["drafts"]["apply_result"]["source"] == "sql_registry"
    assert applied["drafts"]["apply_result"]["registry"]["revision_id"] == "rev_1"
    assert published["publish_result"]["source"] == "sql_registry"
    assert published["publish_result"]["cube"]["status"] == "active"
    assert published["publish_result"]["registry"]["release_id"] == "rel_1"
    assert published["publish_result"]["registry"]["snapshot_id"] == "snap_1"
    assert release_service.calls[0]["gate_result"]["proposal_id"] == proposal["id"]

    second = service.create_proposal({"source_mode": "agent_led", "table": "dwd_student_comment_events"})
    service.draft(second["id"])
    service.validate(second["id"])
    service.approve(second["id"], {"approved_by": "semantic_owner"})
    service.apply(second["id"])

    asset = registry.get_asset("default", "cube", "student_comments")
    assert asset.status == "active"
    assert asset.current_release_id == "rel_1"


def test_confirm_source_records_action_and_is_idempotent_for_same_source():
    service = _service()
    proposal = service.create_proposal(
        {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": "查询学生评论数",
        }
    )

    confirmed = service.confirm_source(
        proposal["id"],
        {
            "actor": "semantic_owner",
            "source_kind": "physical_table",
            "database": "dw",
            "table": "dwd_student_comment_events",
        },
    )
    confirmed_again = service.confirm_source(
        proposal["id"],
        {
            "actor": "semantic_owner",
            "source_kind": "physical_table",
            "database": "dw",
            "table": "dwd_student_comment_events",
        },
    )

    assert confirmed["source_context"]["confirmed_source"]["table"] == "dwd_student_comment_events"
    assert confirmed["proposal_revision_no"] == proposal["proposal_revision_no"] + 1
    assert confirmed_again["proposal_revision_no"] == confirmed["proposal_revision_no"]
    assert [
        action["action"]
        for action in confirmed_again["action_log"]
        if action["action"] == "confirm_source"
    ] == ["confirm_source"]


def test_update_spec_bumps_revision_and_invalidates_previous_approval():
    service = _service()
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])
    approved = service.approve(proposal["id"], {"approved_by": "semantic_owner"})

    updated = service.update_spec(
        proposal["id"],
        {
            "actor": "semantic_owner",
            "cube": {"name": "student_comments_v2"},
        },
    )

    assert updated["proposal_revision_no"] == approved["proposal_revision_no"] + 1
    assert updated.get("approved_spec_hash") is None
    assert updated.get("approved_proposal_revision_no") is None
    assert updated["status"] == "drafted"
    assert updated["spec"]["cube"]["name"] == "student_comments_v2"
    assert updated["action_log"][-1]["action"] == "update_spec"
    with pytest.raises(ValueError, match="approved"):
        service.apply(proposal["id"])


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


def _minimal_human_spec():
    """human_led 工作台典型产物：缺 grain/time_dimension/additivity/binding_status 的最小 spec。

    用中性 subject/table 避免命中 repair 的 canonical 整块替换规则。
    """
    return {
        "spec_version": "v1",
        "source": {"source_kind": "physical_table", "table": "fct_kpi"},
        "business": {"subject": "指标", "sensitivity_level": "restricted"},
        "cube": {
            "name": "fct_kpi",
            "table": "fct_kpi",
            "default_time_dimension": "biz_date",
            "dimensions": {
                "biz_date": {"title": "日期", "type": "time", "sql": "`biz_date`"},
                "id": {"title": "ID", "type": "string", "sql": "`id`", "primary_key": True},
            },
            "measures": {
                "total_count": {
                    "title": "总数",
                    "type": "count",
                    "sql": "COUNT(`id`)",
                    "certified": True,
                    "non_additive": False,
                }
            },
        },
        "ontology": {
            "object": {
                "name": "kpi_object",
                "cube_bindings": [{"cube": "fct_kpi", "role": "primary", "entity_key": "id"}],
            },
            "metrics": [
                {
                    "name": "kpi_total_count",
                    "measure_refs": ["fct_kpi.total_count"],
                    # 故意缺：grain / time_dimension / additivity / binding_status
                }
            ],
        },
    }


class _MinimalSpecBuilder:
    """返回缺机械字段的最小 spec；validate 永远 ready，让 blocker 完全由 ValidationMatrixBuilder 机械规则决定。"""

    def __init__(self):
        self.spec = _minimal_human_spec()
        self.calls = []

    def create_spec_draft(self, payload):
        self.calls.append(("spec_draft", payload))
        return {"spec": deepcopy(self.spec), "next_actions": {"default_publish_target": "cube_and_ontology"}}

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
        return {"status": "ready", "issues": [], "checks": {"metric_binding": "passed"}}

    def apply(self, spec):
        self.calls.append(("apply", spec))
        return {"published": False, "assets": {"cube": {"name": spec["cube"]["name"]}}, "spec": spec}

    def publish(self, spec, publish_targets=None):
        self.calls.append(("publish", spec, publish_targets))
        return {"publish_targets": publish_targets or {"cube": True, "ontology": False}}


def test_human_led_missing_mechanical_fields_validates_and_approves():
    """B3：human_led 缺机械字段的最小 spec，draft+validate 后应被 repair 补全为 validated（非 blocked），approve 不 raise。"""
    service = _service(builder=_MinimalSpecBuilder())
    created = service.create_proposal(
        {
            "source_mode": "human_led",
            "source_kind": "physical_table",
            "table": "fct_kpi",
            "business_subject": "指标",
        }
    )
    assert created["source_mode"] == "human_led"

    drafted = service.draft(created["id"])
    assert drafted["status"] == "drafted"
    # repair 已在 draft 阶段补全机械字段
    metric = drafted["spec"]["ontology"]["metrics"][0]
    assert metric["grain"]
    assert metric["additivity"]
    assert metric["binding_status"] in {"approved", "active"}

    validated = service.validate(created["id"])
    assert validated["status"] == "validated"
    assert validated["validation_matrix"]["blockers"] == []

    approved = service.approve(created["id"], {"approved_by": "semantic_owner"})
    assert approved["status"] == "approved"


def test_human_led_preserves_explicit_complete_spec():
    """B3：human_led 已含完整显式机械值的 spec → repair 后原样保留（不被默认值覆盖）。"""

    class _CompleteSpecBuilder(_MinimalSpecBuilder):
        def __init__(self):
            super().__init__()
            spec = _minimal_human_spec()
            spec["ontology"]["metrics"][0].update(
                {
                    "grain": "biz_date",
                    "time_dimension": "biz_date",
                    "additivity": "non_additive",
                    "binding_status": "approved",
                }
            )
            self.spec = spec

    service = _service(builder=_CompleteSpecBuilder())
    created = service.create_proposal(
        {"source_mode": "human_led", "table": "fct_kpi", "business_subject": "指标"}
    )
    drafted = service.draft(created["id"])
    metric = drafted["spec"]["ontology"]["metrics"][0]
    assert metric["grain"] == "biz_date"
    assert metric["time_dimension"] == "biz_date"
    assert metric["additivity"] == "non_additive"  # 显式值未被默认 additive 覆盖


def test_human_led_blocked_then_update_spec_recovers_full_chain():
    """B3：human_led blocked → update_spec 补字段 → validate → approve → apply → publish 全链路通。"""

    class _BlockingBuilder(_MinimalSpecBuilder):
        """draft 产出携带直拼 SQL 的 metric → generated_sql_bypasses_cube blocker（repair 不会删），update_spec 去掉后可恢复。"""

        def __init__(self):
            super().__init__()
            spec = _minimal_human_spec()
            # metric 携带直拼 SQL → ValidationMatrixBuilder 产 generated_sql_bypasses_cube blocker
            spec["ontology"]["metrics"][0]["sql"] = "SELECT count(*) FROM fct_kpi"
            self.spec = spec

    service = _service(builder=_BlockingBuilder())
    created = service.create_proposal(
        {"source_mode": "human_led", "table": "fct_kpi", "business_subject": "指标"}
    )
    service.draft(created["id"])
    blocked = service.validate(created["id"])
    # repair 不会删除直拼 SQL，仍 blocked → 真实死锁场景
    assert blocked["status"] == "blocked"
    with pytest.raises(ValueError, match="validated"):
        service.approve(created["id"])

    # update_spec 用不含 sql 的 metric 整体替换该指标恢复（_deep_merge 对 list 整体替换）
    service.update_spec(
        created["id"],
        {
            "actor": "semantic_owner",
            "ontology": {
                "metrics": [
                    {
                        "name": "kpi_total_count",
                        "measure_refs": ["fct_kpi.total_count"],
                    }
                ]
            },
        },
    )
    revalidated = service.validate(created["id"])
    assert revalidated["status"] == "validated"
    service.approve(created["id"], {"approved_by": "semantic_owner"})
    applied = service.apply(created["id"])
    assert applied["status"] == "applied"
    published = service.publish(created["id"], publish_targets={"cube": True, "ontology": False})
    assert published["status"] == "published"


@pytest.mark.parametrize("source_mode", ["human_led", "agent_led"])
def test_validate_blocks_typo_measure_ref_end_to_end(source_mode):
    """typo 缺口端到端：spec 带指向不存在度量的 ref → service.validate 必须 blocked。

    验证 repair 不再把 typo 静默改回 total_count（否则校验前就看不到了），ValidationMatrix 拦住。
    """

    class _TypoRefBuilder(_MinimalSpecBuilder):
        def __init__(self):
            super().__init__()
            spec = _minimal_human_spec()
            # typo：度量名拼错，不存在于 cube.measures
            spec["ontology"]["metrics"][0]["measure_refs"] = ["fct_kpi.totl_count"]
            self.spec = spec

    service = _service(builder=_TypoRefBuilder())
    created = service.create_proposal(
        {"source_mode": source_mode, "table": "fct_kpi", "business_subject": "指标"}
    )
    service.draft(created["id"])
    result = service.validate(created["id"])

    assert result["status"] == "blocked"
    blocker_codes = {b["code"] for b in result["validation_matrix"]["blockers"]}
    assert "metric_measure_ref_unknown" in blocker_codes
    # typo ref 仍可见（未被 repair 蒙混成 total_count）
    from app.domain.ontology.entities import measure_ref_strings as _mrs

    assert _mrs(result["spec"]["ontology"]["metrics"][0]["measure_refs"]) == ["fct_kpi.totl_count"]
    with pytest.raises(ValueError, match="validated"):
        service.approve(created["id"])


def test_validate_blocks_human_set_pending_binding_status_end_to_end():
    """#4 端到端：human_led metric 显式 binding_status='pending' → repair 不得改 approved，
    service.validate 必须因 binding_lifecycle_not_approved blocked，approve raise。"""

    class _PendingBindingBuilder(_MinimalSpecBuilder):
        def __init__(self):
            super().__init__()
            spec = _minimal_human_spec()
            spec["ontology"]["metrics"][0]["binding_status"] = "pending"
            self.spec = spec

    service = _service(builder=_PendingBindingBuilder())
    created = service.create_proposal(
        {"source_mode": "human_led", "table": "fct_kpi", "business_subject": "指标"}
    )
    service.draft(created["id"])
    result = service.validate(created["id"])

    assert result["status"] == "blocked"
    blocker_codes = {b["code"] for b in result["validation_matrix"]["blockers"]}
    assert "binding_lifecycle_not_approved" in blocker_codes
    # 显式 pending 仍在（未被 repair 抹成 approved）
    assert result["spec"]["ontology"]["metrics"][0]["binding_status"] == "pending"
    with pytest.raises(ValueError, match="validated"):
        service.approve(created["id"])


def _service_at_applied():
    """把一个 proposal 推到 applied 态，返回 (service, proposal_id)。"""
    service = _service()
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])
    service.approve(proposal["id"], {"approved_by": "semantic_owner"})
    applied = service.apply(proposal["id"])
    assert applied["status"] == "applied"
    return service, proposal["id"]


def _service_at_published():
    """把一个 proposal 推到 published 态，返回 (service, proposal_id)。"""
    service, proposal_id = _service_at_applied()
    published = service.publish(proposal_id, publish_targets={"cube": True, "ontology": False})
    assert published["status"] == "published"
    return service, proposal_id


def test_update_spec_rejects_applied_proposal_without_force():
    """B2 守卫：applied 态 update_spec 无 force → raise，状态/applied_spec_hash 不被回退。"""
    service, proposal_id = _service_at_applied()
    before = service.get_proposal(proposal_id)

    with pytest.raises(ValueError, match="applied"):
        service.update_spec(proposal_id, {"actor": "semantic_owner", "cube": {"name": "student_comments_v2"}})

    after = service.get_proposal(proposal_id)
    assert after["status"] == "applied"
    assert after["applied_spec_hash"] == before["applied_spec_hash"]
    assert after["proposal_revision_no"] == before["proposal_revision_no"]


def test_update_spec_rejects_published_proposal_without_force():
    """B2 守卫：published 态 update_spec 无 force → raise，状态不被原地回退。"""
    service, proposal_id = _service_at_published()
    before = service.get_proposal(proposal_id)

    with pytest.raises(ValueError, match="published"):
        service.update_spec(proposal_id, {"actor": "semantic_owner", "cube": {"name": "student_comments_v2"}})

    after = service.get_proposal(proposal_id)
    assert after["status"] == "published"
    assert after["proposal_revision_no"] == before["proposal_revision_no"]


def test_update_spec_force_on_published_archives_superseded_publish():
    """B2 force 逃生阀：published + force → 回 drafted，但 superseded_publishes 已归档原 hash，revision +1。"""
    service, proposal_id = _service_at_published()
    before = service.get_proposal(proposal_id)
    original_applied_hash = before["applied_spec_hash"]
    original_scope_hash = before["audit_snapshot"].get("publish_scope_hash")

    updated = service.update_spec(
        proposal_id,
        {"actor": "owner_b", "force": True, "cube": {"name": "student_comments_v2"}},
    )

    assert updated["status"] == "drafted"
    assert updated["proposal_revision_no"] == before["proposal_revision_no"] + 1
    # _bump_revision 已清现役 hash
    assert updated.get("approved_spec_hash") is None
    assert updated.get("applied_spec_hash") is None
    # 但审计已归档原已发布物
    superseded = updated["audit_snapshot"]["superseded_publishes"]
    assert len(superseded) == 1
    entry = superseded[0]
    assert entry["status"] == "published"
    assert entry["applied_spec_hash"] == original_applied_hash
    assert entry["publish_scope_hash"] == original_scope_hash
    assert entry["superseded_by"] == "owner_b"
    assert entry["superseded_at"]


def test_update_spec_not_guarded_for_drafted_and_validated():
    """B2 守卫不误伤：drafted/validated 态 update_spec 正常更新（不 raise）。"""
    # drafted 态
    service = _service()
    p1 = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(p1["id"])
    updated1 = service.update_spec(p1["id"], {"actor": "semantic_owner", "cube": {"name": "renamed_drafted"}})
    assert updated1["status"] == "drafted"
    assert updated1["spec"]["cube"]["name"] == "renamed_drafted"

    # validated 态
    service2 = _service()
    p2 = service2.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service2.draft(p2["id"])
    service2.validate(p2["id"])
    updated2 = service2.update_spec(p2["id"], {"actor": "semantic_owner", "cube": {"name": "renamed_validated"}})
    assert updated2["status"] == "drafted"
    assert updated2["spec"]["cube"]["name"] == "renamed_validated"


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


def test_validation_matrix_blocks_when_metric_binding_missing_measure():
    """B3 后：缺陷 spec 的拦截契约改由 ValidationMatrixBuilder 直接守（service.validate 现两 mode 都先 repair 自愈）。

    measure_ref 缺失 → builder.validate 报 metric_binding failed → 归一为 blocker。
    """
    spec = _spec()
    spec["ontology"]["metrics"][0]["measure_refs"] = ["student_comments.missing_count"]
    # 模拟 builder 语义校验对未解析 measure_ref 的 error issue
    validation = {
        "status": "blocked",
        "issues": [{"severity": "error", "path": "metric.measure_refs", "message": "无法解析 Measure 引用"}],
    }

    matrix = ValidationMatrixBuilder().build(spec, validation)

    assert any(issue["severity"] == "error" for issue in matrix["blockers"])


def test_validation_matrix_and_readiness_block_when_binding_not_approved():
    """B3 后：binding 未 approved 的运行时拦截契约由 ValidationMatrixBuilder + PublishReadinessChecker 直接守。"""
    spec = _spec()
    spec["ontology"]["metrics"][0]["binding_status"] = "proposed"

    matrix = ValidationMatrixBuilder().build(spec, {"status": "ready", "issues": []})
    assert any(issue["code"] == "binding_lifecycle_not_approved" for issue in matrix["blockers"])

    runtime = PublishReadinessChecker().evaluate(spec, {"status": "ready", "issues": []})
    assert "binding_not_approved" in runtime["reasons"]


def test_validation_matrix_blocks_metric_without_grain_time_dimension_or_additivity():
    """B3 后：缺 grain/time_dim/additivity 的机械缺陷拦截契约由 ValidationMatrixBuilder 直接守。"""
    spec = _spec()
    metric = spec["ontology"]["metrics"][0]
    metric.pop("grain")
    metric.pop("time_dimension")
    metric.pop("additivity")

    matrix = ValidationMatrixBuilder().build(spec, {"status": "ready", "issues": []})

    blocker_codes = {issue["code"] for issue in matrix["blockers"]}
    assert {"metric_grain_missing", "metric_time_dimension_missing", "metric_additivity_missing"} <= blocker_codes


def test_validate_repairs_agent_led_student_comment_runtime_contract_before_blocking():
    builder = _Builder()
    metric = builder.spec["ontology"]["metrics"][0]
    metric.pop("grain")
    metric.pop("time_dimension")
    metric.pop("additivity")
    # #4：binding_status 留未设 → repair 默认 approved（agent_led 骨架/onboard 升的指标正常流）。
    # 不再人为设 proposed 后期望被 repair 抹成 approved（那是被 #4 修正的过度改写）。
    metric.pop("binding_status", None)
    service = _service(builder)

    proposal = service.create_proposal({"source_mode": "agent_led", "user_question": "最近7天学生评论数按学校汇总"})
    service.draft(proposal["id"])
    result = service.validate(proposal["id"])

    repaired_metric = result["spec"]["ontology"]["metrics"][0]
    assert result["status"] == "validated"
    assert repaired_metric["grain"] == "school_id,comment_time"
    assert repaired_metric["time_dimension"] == "comment_time"
    assert repaired_metric["additivity"] == "additive"
    # 未设 → repair 默认 approved（happy path 不变）
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
    assert result["checks"]["binding_matrix"] == "passed"
    assert result["binding_blockers"] == []


def test_readiness_blocks_on_binding_matrix_broken_link():
    checker = PublishReadinessChecker()
    spec = _spec(status="active")
    spec["ontology"]["object"]["cube_bindings"] = [
        {"cube": "missing_cube", "role": "primary", "entity_key": "school_id"}
    ]

    result = checker.evaluate(spec)

    assert result["canonical_ready"] is False
    assert "binding_broken:object_binding_unresolved" in result["reasons"]
    assert result["checks"]["binding_matrix"] == "failed"
    assert any(
        blocker["code"] == "object_binding_unresolved"
        for blocker in result["binding_blockers"]
    )


def test_published_ready_proposal_exposes_backend_readiness_label():
    builder = _Builder()
    builder.spec = _spec(status="active")
    service = _service(builder)
    proposal = service.create_proposal({"source_mode": "human_led", "table": "dwd_student_comment_events"})
    service.draft(proposal["id"])
    service.validate(proposal["id"])

    result = service.get_proposal(proposal["id"])

    assert result["readiness_label"] == "Can Publish"
