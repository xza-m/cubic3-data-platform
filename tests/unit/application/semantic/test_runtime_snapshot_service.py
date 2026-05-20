from __future__ import annotations

from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.application.semantic.runtime_snapshot_service import RuntimeSnapshotService
from app.domain.semantic.asset_registry import RUNTIME_MANIFEST_SCHEMA_VERSION, RuntimeSnapshot, SemanticAsset
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


def test_runtime_snapshot_service_rejects_snapshot_without_release(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    service = RuntimeSnapshotService(repo)
    repo.save_runtime_snapshot(
        RuntimeSnapshot(
            id="snap_1",
            release_id="missing_rel",
            namespace="qa_live_1",
            status="active",
            asset_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "assets": []},
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        )
    )

    result = service.get_active_manifest("qa_live_1")

    assert result["ok"] is False
    assert result["error_code"] == "semantic_runtime_release_not_found"
    assert result["snapshot_id"] == "snap_1"
    assert result["release_id"] == "missing_rel"


def test_runtime_snapshot_service_returns_version_pin_and_asset_trace(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    release_service = SemanticReleaseService(repo)
    service = RuntimeSnapshotService(repo)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(
        asset.id,
        {
            "cube": {
                "name": "student_comment",
                "title": "学生评论",
                "table": "dws.student_comment",
                "source_id": 1,
                "source_database": "dw",
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
            }
        },
    )

    release = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_1",
    )
    active_snapshot = repo.get_active_snapshot("qa_live_1")

    result = service.get_active_manifest("qa_live_1")

    assert result["ok"] is True
    assert result["version_pin"] == {
        "namespace": "qa_live_1",
        "snapshot_id": active_snapshot.id,
        "snapshot_status": "active",
        "release_id": release.id,
        "release_no": 1,
        "release_status": "published",
        "previous_release_id": None,
        "rollback_of_release_id": None,
        "manifest_schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
        "asset_count": 1,
        "asset_revision_ids": [revision.id],
    }
    assert result["asset_trace"] == [
        {
            "asset_id": asset.id,
            "asset_type": "cube",
            "asset_key": "student_comment",
            "revision_id": revision.id,
            "spec_checksum": revision.spec_checksum,
            "status": "published",
        }
    ]
