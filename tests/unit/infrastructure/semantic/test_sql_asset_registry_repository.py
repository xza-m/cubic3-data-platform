from __future__ import annotations

from app.domain.semantic.asset_registry import (
    RuntimeSnapshot,
    SemanticRelease,
    SemanticReleaseAsset,
    SemanticAsset,
    SemanticAssetDependency,
)
from app.infrastructure.semantic.sql_asset_registry_repository import (
    SqlAssetRegistryRepository,
)


def test_sql_asset_registry_creates_asset_and_reuses_same_checksum_revision(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
            title="学生评论",
            source_kind="copilot",
        )
    )

    first = repo.append_revision(
        asset.id,
        {"cube": {"name": "student_comment"}, "measures": [{"name": "comment_count"}]},
        proposal_id="proposal_1",
        actor="alice",
    )
    second = repo.append_revision(
        asset.id,
        {"measures": [{"name": "comment_count"}], "cube": {"name": "student_comment"}},
        proposal_id="proposal_1",
        actor="alice",
    )

    assert first.id == second.id
    assert second.revision_no == 1
    loaded = repo.get_asset("qa_live_1", "cube", "student_comment")
    assert loaded is not None
    assert loaded.current_revision_id == first.id


def test_sql_asset_registry_rejects_registry_key_mutation(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
            title="学生评论",
        )
    )

    updated = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
            title="学生评论 v2",
        )
    )

    assert updated.title == "学生评论 v2"
    assert updated.registry_key == ("qa_live_1", "cube", "student_comment")


def test_sql_asset_registry_replaces_dependencies_for_revision(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_cube",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    dependency = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_policy",
            namespace="qa_live_1",
            asset_type="policy",
            asset_key="student_comment_policy",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})

    repo.replace_dependencies(
        revision.id,
        [
            SemanticAssetDependency(
                id="dep_1",
                asset_revision_id=revision.id,
                depends_on_asset_id=dependency.id,
                dependency_type="policy",
                required=True,
            )
        ],
    )

    assert [item.depends_on_asset_id for item in repo.list_dependencies(revision.id)] == [
        "asset_policy"
    ]
    repo.replace_dependencies(revision.id, [])
    assert repo.list_dependencies(revision.id) == []


def test_runtime_snapshot_repository_resolves_only_active_manifest_assets(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    snapshot = RuntimeSnapshot(
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

    repo.save_runtime_snapshot(snapshot)

    active = repo.get_active_snapshot("qa_live_1")
    assert active is not None
    assert repo.resolve_asset(active.id, "cube", "student_comment").revision_id == "rev_1"
    assert repo.resolve_asset(active.id, "cube", "draft_only") is None


def test_sql_asset_registry_uses_postgresql_advisory_lock_for_release_namespace():
    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _Session:
        def __init__(self):
            self.calls = []

        def get_bind(self):
            return _Bind()

        def execute(self, statement, params):
            self.calls.append((str(statement), params))

    session = _Session()
    repo = SqlAssetRegistryRepository(session)

    repo._lock_release_namespace("qa_live_1")

    assert "pg_advisory_xact_lock" in session.calls[0][0]
    assert session.calls[0][1]["lock_key"] == "semantic_release:qa_live_1"


def test_publish_with_snapshot_resolves_previous_release_inside_locked_transaction(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})
    first = repo.publish_with_snapshot(
        SemanticRelease(
            id="rel_1",
            release_no=0,
            namespace="qa_live_1",
            status="published",
            scope_json={"revision_ids": [revision.id]},
            gate_result_json={"decision": "allow"},
        ),
        [
            SemanticReleaseAsset(
                release_id="rel_1",
                asset_id=asset.id,
                revision_id=revision.id,
                asset_type=asset.asset_type,
                asset_key=asset.asset_key,
            )
        ],
        RuntimeSnapshot(
            id="snap_1",
            release_id="rel_1",
            namespace="qa_live_1",
            status="active",
            asset_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "assets": []},
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        ),
    )

    second = repo.publish_with_snapshot(
        SemanticRelease(
            id="rel_2",
            release_no=0,
            namespace="qa_live_1",
            status="published",
            scope_json={"revision_ids": [revision.id]},
            gate_result_json={"decision": "allow"},
            previous_release_id="stale_pre_lock_read",
        ),
        [
            SemanticReleaseAsset(
                release_id="rel_2",
                asset_id=asset.id,
                revision_id=revision.id,
                asset_type=asset.asset_type,
                asset_key=asset.asset_key,
            )
        ],
        RuntimeSnapshot(
            id="snap_2",
            release_id="rel_2",
            namespace="qa_live_1",
            status="active",
            asset_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "assets": []},
            binding_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
            policy_manifest_json={"schema_version": "semantic-runtime-manifest/v1", "policies": []},
        ),
    )

    assert first.release_no == 1
    assert second.release_no == 2
    assert second.previous_release_id == "rel_1"
