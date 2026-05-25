from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.domain.semantic.asset_registry import SemanticAsset
from app.infrastructure.semantic.models import SemanticReleaseORM, SemanticRuntimeSnapshotORM
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository
from tests.support.semantic_fixture_manager import SemanticTestFixtureManager


def test_postgresql_concurrent_publish_serializes_release_numbers_and_active_snapshot():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        pytest.skip("set DATABASE_URL to run PostgreSQL concurrency verification")
    if not (database_url.startswith("postgresql://") or database_url.startswith("postgresql+")):
        pytest.skip("semantic release concurrency verification requires PostgreSQL DATABASE_URL")

    engine = create_engine(database_url, pool_size=8, max_overflow=4, pool_pre_ping=True)
    if engine.dialect.name != "postgresql":
        engine.dispose()
        pytest.skip("semantic release concurrency verification requires PostgreSQL")

    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup_session = session_factory()
    namespace = SemanticTestFixtureManager(setup_session).namespace("pg_concurrency")
    try:
        repo = SqlAssetRegistryRepository(setup_session)
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
                    "table": "df_cb_258187.dwd_interaction_comment_reports_df",
                    "source_id": 1,
                    "dimensions": {
                        "comment_id": {
                            "title": "评论ID",
                            "type": "string",
                            "sql": "{CUBE}.comment_id",
                        }
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
        setup_session.close()

        def _publish(index: int):
            session = session_factory()
            try:
                return SemanticReleaseService(SqlAssetRegistryRepository(session)).publish(
                    namespace=namespace,
                    revision_ids=[revision.id],
                    actor=f"worker_{index}",
                    gate_result={"decision": "allow"},
                    idempotency_key=f"pub_{namespace}_{index}",
                )
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=4) as executor:
            releases = list(executor.map(_publish, range(4)))

        verify_session = session_factory()
        try:
            rows = (
                verify_session.query(SemanticReleaseORM)
                .filter(
                    SemanticReleaseORM.namespace == namespace,
                    SemanticReleaseORM.status == "published",
                )
                .order_by(SemanticReleaseORM.release_no.asc())
                .all()
            )
            assert [row.release_no for row in rows] == [1, 2, 3, 4]
            assert {release.id for release in releases} == {row.id for row in rows}
            assert [row.previous_release_id for row in rows] == [
                None,
                rows[0].id,
                rows[1].id,
                rows[2].id,
            ]
            assert (
                verify_session.query(SemanticRuntimeSnapshotORM)
                .filter(
                    SemanticRuntimeSnapshotORM.namespace == namespace,
                    SemanticRuntimeSnapshotORM.status == "active",
                )
                .count()
                == 1
            )
        finally:
            verify_session.close()
    finally:
        cleanup_session = session_factory()
        try:
            SemanticTestFixtureManager(cleanup_session).cleanup_namespace(namespace)
        finally:
            cleanup_session.close()
            engine.dispose()
