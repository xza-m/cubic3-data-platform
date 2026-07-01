from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.domain.semantic.asset_registry import (
    RuntimeSnapshot,
    SemanticRelease,
    SemanticReleaseAsset,
    SemanticAsset,
    SemanticAssetDependency,
)
from app.infrastructure.semantic.models import SemanticAssetORM
from app.infrastructure.semantic.sql_asset_registry_repository import (
    SqlAssetRegistryRepository,
)
from tests.support.semantic_fixture_manager import SemanticTestFixtureManager


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


def test_sql_asset_registry_uses_distinct_advisory_lock_for_asset_key():
    """P1-1：asset upsert 的锁 key 前缀必须与 release 发布锁不同，避免共享同一把锁。"""

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

    repo._lock_asset_key("qa_live_1", "cube", "student_comment")

    assert "pg_advisory_xact_lock" in session.calls[0][0]
    assert session.calls[0][1]["lock_key"] == "semantic_asset:qa_live_1:cube:student_comment"


def test_create_or_update_asset_handles_concurrent_insert_conflict_via_mock_session():
    """P1-1（mock session 路径）：insert 撞 unique constraint 抛 IntegrityError 时，
    create_or_update_asset 必须捕获、回滚并采纳赢家已提交的行返回，不得让异常裸抛给调用方，
    也不得用本次调用（输家）的字段值覆盖赢家的数据（先提交者赢，不做"最后写入者覆盖"式合并）。"""

    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _FakeRow:
        def __init__(self, asset: SemanticAsset):
            self.id = asset.id
            self.namespace = asset.namespace
            self.asset_type = asset.asset_type
            self.asset_key = asset.asset_key
            self.title = asset.title
            self.status = asset.status
            self.current_revision_id = asset.current_revision_id
            self.current_release_id = asset.current_release_id
            self.owner_principal_id = asset.owner_principal_id
            self.source_kind = asset.source_kind
            self.created_at = None
            self.updated_at = None

    class _ConflictingSession:
        """模拟：第一次 select 看不到记录（并发者尚未提交）-> insert 撞唯一约束抛 IntegrityError
        -> 捕获后 rollback -> 重新 select 这次能读到（并发者已提交）-> 走 update 分支合并返回。"""

        def __init__(self, committed_row: _FakeRow):
            self.execute_calls = []
            self._committed_row = committed_row
            self._select_count = 0
            self._insert_attempted = False
            self.rolled_back = False

        def get_bind(self):
            return _Bind()

        def execute(self, statement, params):
            self.execute_calls.append((str(statement), params))

        def query(self, *_args, **_kwargs):
            return self

        def filter(self, *_args, **_kwargs):
            return self

        def first(self):
            self._select_count += 1
            if self._select_count == 1:
                # 第一次 select：并发者尚未提交，看不到记录。
                return None
            # 冲突之后重试 select：并发者已提交，这次能读到。
            return self._committed_row

        def add(self, row):
            self._insert_attempted = True
            raise IntegrityError("insert failed", {}, Exception("duplicate key"))

        def commit(self):
            pass

        def rollback(self):
            self.rolled_back = True

    existing_asset = SemanticAsset(
        id="asset_existing",
        namespace="qa_live_1",
        asset_type="cube",
        asset_key="student_comment",
        title="学生评论(并发写入者)",
        status="draft",
    )
    session = _ConflictingSession(_FakeRow(existing_asset))

    repo = SqlAssetRegistryRepository(session)
    asset = SemanticAsset(
        id="asset_new",
        namespace="qa_live_1",
        asset_type="cube",
        asset_key="student_comment",
        title="学生评论",
        status="draft",
    )

    result = repo.create_or_update_asset(asset)

    assert result is not None
    assert result.id == existing_asset.id
    # 先提交者赢：本次调用（输家）的 title 不得覆盖赢家已提交的值。
    assert result.title == existing_asset.title
    assert session._insert_attempted is True
    assert session.rolled_back is True
    lock_calls = [call for call in session.execute_calls if "pg_advisory_xact_lock" in call[0]]
    assert lock_calls
    assert lock_calls[0][1]["lock_key"] == "semantic_asset:qa_live_1:cube:student_comment"


def test_create_or_update_asset_concurrent_real_postgres_produces_single_record():
    """P1-1（真实 Postgres 路径）：两个独立 session 并发 upsert 同一 asset_key，最终只产生一条记录。"""
    database_url = os.environ.get("SEMANTIC_POSTGRES_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        pytest.skip("set DATABASE_URL to run PostgreSQL concurrency verification")
    if not (database_url.startswith("postgresql://") or database_url.startswith("postgresql+")):
        pytest.skip("asset upsert concurrency verification requires PostgreSQL DATABASE_URL")

    engine = create_engine(database_url, pool_size=8, max_overflow=4, pool_pre_ping=True)
    if engine.dialect.name != "postgresql":
        engine.dispose()
        pytest.skip("asset upsert concurrency verification requires PostgreSQL")

    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup_session = session_factory()
    namespace = SemanticTestFixtureManager(setup_session).namespace("qa_concurrency_asset_upsert")
    setup_session.close()
    try:
        def _upsert(index: int):
            session = session_factory()
            try:
                repo = SqlAssetRegistryRepository(session)
                return repo.create_or_update_asset(
                    SemanticAsset(
                        id=f"asset_{namespace}_{index}",
                        namespace=namespace,
                        asset_type="cube",
                        asset_key="student_comment",
                        title=f"学生评论_{index}",
                        source_kind="test_fixture",
                    )
                )
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(_upsert, range(4)))

        assert len(results) == 4
        verify_session = session_factory()
        try:
            count = (
                verify_session.query(SemanticAssetORM)
                .filter(
                    SemanticAssetORM.namespace == namespace,
                    SemanticAssetORM.asset_type == "cube",
                    SemanticAssetORM.asset_key == "student_comment",
                )
                .count()
            )
            assert count == 1
        finally:
            verify_session.close()
    finally:
        cleanup_session = session_factory()
        try:
            SemanticTestFixtureManager(cleanup_session).cleanup_namespace(namespace)
        finally:
            cleanup_session.close()
            engine.dispose()


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
