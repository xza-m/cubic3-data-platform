from __future__ import annotations

from app.application.semantic.publish_gate_service import PublishGateService
from app.domain.semantic.asset_registry import SemanticAssetDependency, SemanticAssetRevision


def _active_cube_spec(**overrides):
    spec = {
        "cube": {
            "name": "student_comment",
            "title": "学生评论",
            "table": "df_cb_258187.dwd_interaction_comment_reports_df",
            "source_id": 1,
            "status": "active",
            "dimensions": {
                "comment_id": {"title": "评论ID", "type": "string", "sql": "{CUBE}.comment_id"}
            },
            "measures": {
                "comment_count": {
                    "title": "评论数",
                    "type": "number",
                    "sql": "COUNT(DISTINCT {CUBE}.comment_id)",
                }
            },
        },
        "governance": {"sensitivity_level": "public"},
        "ontology": {"policies": [{"name": "public_policy"}]},
        "bindings": [{"metric": "comment_count"}],
    }
    spec.update(overrides)
    return spec


def test_publish_gate_denies_stale_approved_checksum():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={"cube": {"name": "student_comment"}},
        proposal_id="proposal_1",
    )
    gate = PublishGateService()

    result = gate.evaluate(
        revision,
        approved_spec_hash="b" * 64,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert "approved_spec_stale" in result.reasons


def test_publish_gate_requires_policy_for_restricted_assets():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={
            "cube": {"name": "student_comment", "status": "active"},
            "governance": {"sensitivity_level": "restricted", "approval_granted": False},
            "ontology": {"policies": []},
        },
        proposal_id="proposal_1",
    )
    gate = PublishGateService()

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "approval_required"
    assert "restricted_requires_approval" in result.reasons


def test_publish_gate_denies_dependency_cycles():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={"cube": {"name": "student_comment", "status": "active"}},
        proposal_id="proposal_1",
    )
    gate = PublishGateService()

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[
            SemanticAssetDependency(
                id="dep_self",
                asset_revision_id="rev_1",
                depends_on_asset_id="asset_1",
                dependency_type="runtime",
                required=True,
            )
        ],
    )

    assert result.decision == "deny"
    assert "dependency_cycle_detected" in result.reasons


def test_publish_gate_allows_active_public_asset_with_policy():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={
            "cube": {"name": "student_comment", "status": "active"},
            "governance": {"sensitivity_level": "public"},
            "ontology": {"policies": [{"name": "public_policy"}]},
            "bindings": [{"metric": "comment_count"}],
        },
        proposal_id="proposal_1",
    )
    gate = PublishGateService()

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "allow"
    assert result.reasons == []


def test_publish_gate_denies_schema_checker_failure():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={
            "cube": {"name": "student_comment", "status": "active"},
            "governance": {"sensitivity_level": "public"},
            "ontology": {"policies": [{"name": "public_policy"}]},
        },
    )
    gate = PublishGateService(
        schema_checker=lambda spec: {"ok": False, "errors": ["missing_table: dwd_comment"]},
    )

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert "schema_check_failed" in result.reasons
    assert result.checks["schema"]["errors"] == ["missing_table: dwd_comment"]


def test_publish_gate_denies_binding_compile_failure():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={
            "cube": {"name": "student_comment", "status": "active"},
            "governance": {"sensitivity_level": "public"},
            "ontology": {"policies": [{"name": "public_policy"}]},
            "bindings": [{"metric": "comment_count"}],
        },
    )
    gate = PublishGateService(
        binding_compiler=lambda spec: {"ok": False, "errors": ["missing_measure: comment_count"]},
    )

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert "binding_compile_failed" in result.reasons
    assert result.checks["binding"]["errors"] == ["missing_measure: comment_count"]


def test_publish_gate_denies_runtime_compile_failure():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={
            "cube": {"name": "student_comment", "status": "active"},
            "governance": {"sensitivity_level": "public"},
            "ontology": {"policies": [{"name": "public_policy"}]},
            "bindings": [{"metric": "comment_count"}],
        },
    )
    gate = PublishGateService(
        runtime_compiler=lambda spec: {"status": "blocked", "reason": "QueryDSL 编译失败"},
    )

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert "runtime_compile_failed" in result.reasons
    assert result.checks["runtime"]["reason"] == "QueryDSL 编译失败"


def test_publish_gate_denies_policy_guard_failure():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json={
            "cube": {"name": "student_comment", "status": "active"},
            "governance": {"sensitivity_level": "public"},
            "ontology": {"policies": [{"name": "public_policy"}]},
            "bindings": [{"metric": "comment_count"}],
        },
    )
    gate = PublishGateService(
        policy_checker=lambda spec: {"status": "blocked", "reason": "role_required"},
    )

    result = gate.evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert "policy_denied" in result.reasons
    assert result.checks["policy"]["reason"] == "role_required"


def test_publish_gate_denies_unsupported_sensitivity_level():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json=_active_cube_spec(governance={"sensitivity_level": "secret"}),
    )

    result = PublishGateService().evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert result.reasons == ["sensitivity_level_unsupported"]


def test_publish_gate_requires_approval_for_confidential_profile():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json=_active_cube_spec(governance={"sensitivity_level": "confidential"}),
    )

    blocked = PublishGateService().evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )
    allowed = PublishGateService().evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record={"approval_granted": True},
        dependencies=[],
    )

    assert blocked.decision == "approval_required"
    assert blocked.reasons == ["sensitivity_requires_approval"]
    assert allowed.decision == "allow"


def test_publish_gate_production_profile_wires_runtime_and_binding_checkers():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json=_active_cube_spec(bindings=[{"metric": "missing_metric"}]),
    )

    result = PublishGateService.production().evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert result.reasons == ["binding_compile_failed"]
    assert result.checks["schema"]["counts"]["cubes"] == 1
    assert result.checks["binding"]["errors"] == ["binding_target_not_found:missing_metric"]


def test_publish_gate_production_profile_denies_invalid_runtime_schema():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_1",
        revision_no=1,
        spec_json=_active_cube_spec(
            cube={
                "name": "student_comment",
                "title": "学生评论",
                "table": "df_cb_258187.dwd_interaction_comment_reports_df",
                "status": "active",
                "measures": {},
                "dimensions": {},
            },
        ),
    )

    result = PublishGateService.production().evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )

    assert result.decision == "deny"
    assert result.reasons == ["schema_check_failed"]
    assert "invalid_runtime_asset_spec" in result.checks["schema"]["errors"][0]
