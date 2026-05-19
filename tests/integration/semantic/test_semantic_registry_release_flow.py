from __future__ import annotations

from app.application.semantic.publish_gate_service import PublishGateService
from app.application.semantic.runtime_snapshot_service import RuntimeSnapshotService
from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.domain.semantic.asset_registry import SemanticAsset
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository
from tests.support.semantic_fixture_manager import SemanticTestFixtureManager


def test_semantic_registry_release_flow_publishes_snapshot_and_cleans_namespace(db_session):
    namespace = SemanticTestFixtureManager(db_session).namespace("qa_mock")
    repo = SqlAssetRegistryRepository(db_session)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id=f"asset_{namespace}",
            namespace=namespace,
            asset_type="cube",
            asset_key="student_comment",
            source_kind="test_fixture",
        )
    )
    revision = repo.append_revision(
        asset.id,
        {
            "cube": {
                "name": "student_comment",
                "title": "学生评论",
                "table": "df_cb_258187.dwd_interaction_comment_reports_df",
                "source_id": 1,
                "source_database": "df_cb_258187",
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
        },
    )
    gate_result = PublishGateService().evaluate(
        revision,
        approved_spec_hash=revision.spec_checksum,
        approval_record=None,
        dependencies=[],
    )
    assert gate_result.decision == "allow"

    release = SemanticReleaseService(repo).publish(
        namespace=namespace,
        revision_ids=[revision.id],
        actor="tester",
        gate_result=gate_result.to_dict(),
        idempotency_key=f"pub_{namespace}",
    )
    manifest = RuntimeSnapshotService(repo).get_active_manifest(namespace)

    assert release.status == "published"
    assert manifest["ok"] is True
    assert manifest["release_id"] == release.id

    cleanup = SemanticTestFixtureManager(db_session).cleanup_namespace(namespace)
    assert cleanup["ok"] is True
    assert repo.get_active_snapshot(namespace) is None
