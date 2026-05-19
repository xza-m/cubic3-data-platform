from __future__ import annotations

from app.infrastructure.semantic.models import (
    SemanticAssetORM,
    SemanticAssetRevisionORM,
    SemanticModelingAgentSessionORM,
    SemanticModelingProposalORM,
    SemanticReleaseAssetORM,
    SemanticReleaseORM,
    SemanticRuntimeSnapshotORM,
)
from tests.support.semantic_fixture_manager import SemanticTestFixtureManager


def test_semantic_fixture_manager_cleans_registry_release_snapshot_and_copilot_rows(db_session):
    namespace = "qa_live_fixture_1"
    db_session.add(
        SemanticAssetORM(
            id="asset_1",
            namespace=namespace,
            asset_type="cube",
            asset_key="student_comment",
            status="active",
            source_kind="test_fixture",
        )
    )
    db_session.add(
        SemanticAssetRevisionORM(
            id="rev_1",
            asset_id="asset_1",
            revision_no=1,
            revision_status="published",
            spec_json={"cube": {"name": "student_comment"}},
            spec_checksum="a" * 64,
        )
    )
    db_session.add(
        SemanticReleaseORM(
            id="rel_1",
            release_no=1,
            namespace=namespace,
            status="published",
            scope_json={},
            gate_result_json={},
        )
    )
    db_session.add(
        SemanticReleaseAssetORM(
            release_id="rel_1",
            asset_id="asset_1",
            revision_id="rev_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    db_session.add(
        SemanticRuntimeSnapshotORM(
            id="snap_1",
            release_id="rel_1",
            namespace=namespace,
            status="active",
            asset_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "assets": []},
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        )
    )
    db_session.add(
        SemanticModelingProposalORM(
            id="proposal_1",
            status="drafted",
            payload_json={"test_namespace": namespace},
        )
    )
    db_session.add(
        SemanticModelingAgentSessionORM(
            id="session_1",
            status="active",
            payload_json={"test_namespace": namespace},
            version=1,
        )
    )
    db_session.commit()

    summary = SemanticTestFixtureManager(db_session).cleanup_namespace(namespace)

    assert summary["ok"] is True
    assert summary["deleted"]["runtime_snapshots"] == 1
    assert summary["deleted"]["release_assets"] == 1
    assert summary["deleted"]["releases"] == 1
    assert summary["deleted"]["revisions"] == 1
    assert summary["deleted"]["assets"] == 1
    assert summary["deleted"]["proposals"] == 1
    assert summary["deleted"]["sessions"] == 1
    assert db_session.get(SemanticAssetORM, "asset_1") is None


def test_semantic_fixture_manager_namespace_is_unique():
    manager = SemanticTestFixtureManager(session=None)

    first = manager.namespace("qa_mock")
    second = manager.namespace("qa_mock")

    assert first.startswith("qa_mock_")
    assert second.startswith("qa_mock_")
    assert first != second
