from __future__ import annotations

from app.application.semantic.runtime_snapshot_service import RuntimeSnapshotService
from app.domain.semantic.asset_registry import RuntimeSnapshot
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository


def test_runtime_snapshot_service_rejects_unknown_manifest_version(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = RuntimeSnapshotService(repo)
    repo.save_runtime_snapshot(
        RuntimeSnapshot(
            id="snap_1",
            release_id="rel_1",
            namespace="qa_live_1",
            status="active",
            asset_manifest_json={"schema_version": "semantic-runtime-manifest/v999", "assets": []},
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        )
    )

    result = service.get_active_manifest("qa_live_1")

    assert result["ok"] is False
    assert result["error_code"] == "semantic_runtime_manifest_unsupported"


def test_runtime_snapshot_service_rejects_published_asset_without_spec(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = RuntimeSnapshotService(repo)
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

    result = service.get_active_manifest("qa_live_1")

    assert result["ok"] is False
    assert result["error_code"] == "semantic_runtime_manifest_invalid"
    assert result["reason"] == "published_asset_missing_spec"


def test_runtime_snapshot_service_rejects_uncompilable_asset_spec(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = RuntimeSnapshotService(repo)
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
                        "spec": {"cube": {"name": "student_comment"}},
                    }
                ],
            },
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        )
    )

    result = service.get_active_manifest("qa_live_1")

    assert result["ok"] is False
    assert result["error_code"] == "semantic_runtime_manifest_invalid"
    assert result["reason"] == "published_asset_invalid_spec"


def test_runtime_snapshot_service_reports_not_ready_without_active_snapshot(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = RuntimeSnapshotService(repo)

    result = service.get_active_manifest("qa_live_1")

    assert result["ok"] is False
    assert result["error_code"] == "semantic_runtime_not_ready"
