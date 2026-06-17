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
        spec_json=_active_cube_spec(
            ontology={
                "metrics": [
                    {
                        "name": "missing_metric",
                        "title": "断链指标",
                        "object_name": "obj",
                        "semantic_formula": "按 other_cube.total_count 计算",
                        "measure_refs": [{"ref": "other_cube.total_count", "role": "primary"}],
                    }
                ],
                "policies": [{"name": "missing_metric_policy"}],
            }
        ),
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
    assert result.checks["binding"]["errors"] == [
        "metric_binding_unresolved:ontology.metrics.missing_metric.measure_refs"
    ]


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


# ─── §1.3 断链校验矩阵 ──────────────────────────────────────────────────────


def _matrix(specs, active_catalog=None):
    from app.application.semantic.publish_gate_service import check_binding_matrix

    return check_binding_matrix(specs, active_catalog=active_catalog)


def _codes(result):
    return [item["code"] for item in result["blockers"]]


def test_binding_matrix_blocks_metric_without_primary_ref():
    spec = _active_cube_spec(
        ontology={
            "metrics": [
                {"name": "m1", "title": "M1", "object_name": "o", "semantic_formula": "f", "measure_refs": []}
            ]
        }
    )
    result = _matrix([spec])
    assert _codes(result) == ["metric_binding_missing"]


def test_binding_matrix_resolves_primary_ref_within_batch():
    spec = _active_cube_spec(
        ontology={
            "metrics": [
                {
                    "name": "m1",
                    "title": "M1",
                    "object_name": "o",
                    "semantic_formula": "f",
                    "measure_refs": [{"ref": "student_comment.comment_count", "role": "primary"}],
                }
            ]
        }
    )
    result = _matrix([spec])
    assert result["ok"] is True


def test_binding_matrix_resolves_primary_ref_via_active_manifest():
    from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog

    active_catalog = RuntimeSemanticCatalog.from_manifest(
        {
            "snapshot_id": "snap_1",
            "release_id": "rel_1",
            "asset_manifest_json": {
                "schema_version": "semantic-runtime-manifest/v1",
                "assets": [
                    {
                        "asset_id": "a1",
                        "asset_type": "cube",
                        "asset_key": "student_comment",
                        "revision_id": "rev_1",
                        "spec_checksum": "0" * 64,
                        "spec": _active_cube_spec(),
                        "status": "published",
                    }
                ],
            },
        }
    )
    metric_only_spec = {
        "ontology": {
            "metrics": [
                {
                    "name": "m1",
                    "title": "M1",
                    "object_name": "o",
                    "semantic_formula": "f",
                    "measure_refs": [{"ref": "student_comment.comment_count", "role": "primary"}],
                }
            ]
        }
    }
    assert _matrix([metric_only_spec])["ok"] is False
    assert _matrix([metric_only_spec], active_catalog=active_catalog)["ok"] is True


def test_binding_matrix_blocks_object_without_bindings_and_bad_entity_key():
    missing = _active_cube_spec(ontology={"objects": [{"name": "o1", "title": "O1"}]})
    assert _codes(_matrix([missing])) == ["object_binding_missing"]

    bad_key = _active_cube_spec(
        ontology={
            "objects": [
                {
                    "name": "o1",
                    "title": "O1",
                    "cube_bindings": [
                        {"cube": "student_comment", "role": "primary", "entity_key": "not_a_dim"}
                    ],
                }
            ]
        }
    )
    assert _codes(_matrix([bad_key])) == ["object_binding_unresolved"]


def test_binding_matrix_blocks_unresolvable_relation_and_action():
    spec = _active_cube_spec(
        ontology={
            "objects": [
                {
                    "name": "o1",
                    "title": "O1",
                    "cube_bindings": [{"cube": "student_comment", "role": "primary", "entity_key": "comment_id"}],
                }
            ],
            "relations": [
                {
                    "name": "r1",
                    "title": "R1",
                    "source_object_name": "o1",
                    "target_object_name": "o_missing",
                }
            ],
            "actions": [
                {"name": "a1", "title": "A1", "event_cube_refs": ["missing_cube"]}
            ],
        }
    )
    codes = _codes(_matrix([spec]))
    assert "relation_join_unresolved" in codes
    assert "action_binding_unresolved" in codes


def test_release_service_publish_blocks_on_binding_gate():
    import pytest

    from app.application.semantic.semantic_release_service import (
        SemanticBindingGateError,
        SemanticReleaseService,
    )

    class _Revision:
        def __init__(self, spec):
            self.id = "rev_1"
            self.asset_id = "asset_1"
            self.spec_json = spec
            self.spec_checksum = "0" * 64

    class _Repo:
        def __init__(self, spec):
            self._revision = _Revision(spec)

        def get_revision(self, revision_id):
            return self._revision

        def get_active_release_id(self, namespace):
            return None

        def get_active_snapshot(self, namespace="default"):
            return None

    spec = _active_cube_spec(
        ontology={
            "metrics": [
                {
                    "name": "m1",
                    "title": "M1",
                    "object_name": "o",
                    "semantic_formula": "f",
                    "measure_refs": [{"ref": "other_cube.total", "role": "primary"}],
                }
            ]
        }
    )
    service = SemanticReleaseService(_Repo(spec))
    with pytest.raises(SemanticBindingGateError) as exc_info:
        service.publish(
            namespace="default",
            revision_ids=["rev_1"],
            actor="tester",
            gate_result={"decision": "allow"},
        )
    assert exc_info.value.blockers[0]["code"] == "metric_binding_unresolved"


def test_release_service_publish_activates_spec_statuses():
    from app.application.semantic.semantic_release_service import SemanticReleaseService

    spec = _active_cube_spec()
    spec["cube"]["status"] = "draft"
    spec["ontology"] = {
        "object": {"name": "o1", "title": "O1", "status": "draft",
                    "cube_bindings": [{"cube": "student_comment", "role": "primary", "entity_key": "comment_id"}]},
        "metrics": [
            {
                "name": "m1",
                "title": "M1",
                "object_name": "o1",
                "semantic_formula": "f",
                "status": "draft",
                "measure_refs": [{"ref": "student_comment.comment_count", "role": "primary"}],
            }
        ],
        "policies": [{"name": "p1", "status": "draft"}],
    }

    class _Revision:
        def __init__(self, payload):
            self.id = "rev_1"
            self.asset_id = "asset_1"
            self.spec_json = payload
            self.spec_checksum = "0" * 64

    class _Asset:
        id = "asset_1"
        asset_type = "cube"
        asset_key = "student_comment"

    class _Repo:
        def __init__(self, payload):
            self._revision = _Revision(payload)
            self.published = None

        def get_revision(self, revision_id):
            return self._revision

        def get_asset_by_id(self, asset_id):
            return _Asset()

        def get_active_release_id(self, namespace):
            return None

        def get_active_snapshot(self, namespace="default"):
            return None

        def publish_with_snapshot(self, release, release_assets, snapshot, audit_writer=None):
            self.published = (release, release_assets, snapshot)
            return release

    repo = _Repo(spec)
    SemanticReleaseService(repo).publish(
        namespace="default",
        revision_ids=["rev_1"],
        actor="tester",
        gate_result={"decision": "allow"},
    )
    _, _, snapshot = repo.published
    manifest_spec = snapshot.asset_manifest_json["assets"][0]["spec"]
    assert manifest_spec["cube"]["status"] == "active"
    assert manifest_spec["ontology"]["object"]["status"] == "active"
    assert manifest_spec["ontology"]["metrics"][0]["status"] == "active"
    assert manifest_spec["ontology"]["policies"][0]["status"] == "active"
    # 原始 revision spec 不被修改
    assert spec["cube"]["status"] == "draft"
