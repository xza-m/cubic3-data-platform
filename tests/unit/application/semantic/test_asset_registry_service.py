from __future__ import annotations

from app.application.semantic.asset_registry_service import AssetRegistryService
from app.domain.semantic.asset_registry import RuntimeSnapshot, SemanticAsset
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository


def test_asset_registry_service_blocks_delete_when_active_snapshot_references_asset(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = AssetRegistryService(repo, runtime_snapshot_repository=repo)
    repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    repo.save_runtime_snapshot(
        RuntimeSnapshot(
            id="snap_1",
            release_id="rel_1",
            namespace="qa_live_1",
            status="active",
            asset_manifest_json={
                "schema_version": "semantic-runtime-manifest/v1",
                "assets": [
                    {
                        "asset_id": "asset_student_comment",
                        "asset_type": "cube",
                        "asset_key": "student_comment",
                        "revision_id": "rev_1",
                        "spec_checksum": "a" * 64,
                        "status": "published",
                    }
                ],
            },
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        )
    )

    result = service.delete_asset("qa_live_1", "cube", "student_comment")

    assert result["ok"] is False
    assert result["error_code"] == "asset_referenced_by_active_snapshot"


def test_asset_registry_service_soft_deletes_unreferenced_asset(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = AssetRegistryService(repo, runtime_snapshot_repository=repo)
    repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )

    result = service.delete_asset("qa_live_1", "cube", "student_comment")

    assert result["ok"] is True
    assert repo.get_asset("qa_live_1", "cube", "student_comment").status == "deleted"
