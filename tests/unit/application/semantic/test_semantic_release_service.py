from __future__ import annotations

import pytest

from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.domain.semantic.asset_registry import SemanticAsset
from app.infrastructure.governance.models import GovernanceAuditTraceORM
from app.infrastructure.governance.repositories import SqlGovernanceAuditTraceRepository
from app.infrastructure.semantic.models import SemanticReleaseORM
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository


def test_semantic_release_service_publishes_release_snapshot_and_audit_atomically(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    release_service = SemanticReleaseService(repo)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})
    audit_calls = []

    release = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_1",
        audit_writer=lambda payload: audit_calls.append(payload),
    )

    assert release.status == "published"
    assert release.release_no == 1
    active = repo.get_active_snapshot("qa_live_1")
    assert active is not None
    assert active.release_id == release.id
    assert repo.resolve_asset(active.id, "cube", "student_comment").revision_id == revision.id
    assert active.asset_manifest_json["assets"][0]["spec"]["cube"]["name"] == "student_comment"
    assert audit_calls[0]["release_id"] == release.id


def test_semantic_release_service_writes_governance_audit_trace_in_publish_transaction(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    audit_repo = SqlGovernanceAuditTraceRepository(db_session)
    release_service = SemanticReleaseService(repo, audit_repository=audit_repo)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})

    release = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_1",
    )

    audit_row = db_session.query(GovernanceAuditTraceORM).one()
    assert audit_row.target_type == "semantic_release"
    assert audit_row.target_name == release.id
    assert audit_row.principal_id == "alice"
    assert audit_row.decision == "allow"
    assert audit_row.traceability["release_id"] == release.id
    assert audit_row.traceability["snapshot_id"] == repo.get_active_snapshot("qa_live_1").id


def test_semantic_release_service_rolls_back_when_governance_audit_repository_fails(db_session):
    class _FailingAuditRepository:
        def save(self, *_args, **_kwargs):
            raise RuntimeError("governance audit down")

    repo = SqlAssetRegistryRepository(db_session)
    release_service = SemanticReleaseService(repo, audit_repository=_FailingAuditRepository())
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})

    with pytest.raises(RuntimeError, match="governance audit down"):
        release_service.publish(
            namespace="qa_live_1",
            revision_ids=[revision.id],
            actor="alice",
            gate_result={"decision": "allow"},
            idempotency_key="pub_1",
        )

    assert repo.get_active_snapshot("qa_live_1") is None
    assert (
        db_session.query(SemanticReleaseORM)
        .filter(SemanticReleaseORM.status == "published")
        .count()
        == 0
    )


def test_semantic_release_service_rolls_back_when_audit_write_fails(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    release_service = SemanticReleaseService(repo)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})

    with pytest.raises(RuntimeError, match="audit down"):
        release_service.publish(
            namespace="qa_live_1",
            revision_ids=[revision.id],
            actor="alice",
            gate_result={"decision": "allow"},
            idempotency_key="pub_1",
            audit_writer=lambda payload: (_ for _ in ()).throw(RuntimeError("audit down")),
        )

    assert repo.get_active_snapshot("qa_live_1") is None
    failed = (
        db_session.query(SemanticReleaseORM)
        .filter(
            SemanticReleaseORM.namespace == "qa_live_1",
            SemanticReleaseORM.idempotency_key == "pub_1",
        )
        .one()
    )
    assert failed.status == "failed"
    assert failed.gate_result_json["failure_reason"] == "audit down"

    with pytest.raises(ValueError, match="failed_retry_with_new_idempotency_key"):
        release_service.publish(
            namespace="qa_live_1",
            revision_ids=[revision.id],
            actor="alice",
            gate_result={"decision": "allow"},
            idempotency_key="pub_1",
        )

    recovered = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_2",
    )
    assert recovered.release_no == 2


def test_semantic_release_service_reuses_published_idempotency_key(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    release_service = SemanticReleaseService(repo)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": "student_comment"}})

    first = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_1",
    )
    second = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_1",
    )

    assert second.id == first.id
    assert second.release_no == 1
    assert db_session.query(SemanticReleaseORM).count() == 1


def test_semantic_release_service_rollback_creates_new_release_and_snapshot(db_session):
    repo = SqlAssetRegistryRepository(db_session)
    release_service = SemanticReleaseService(repo)
    asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_student_comment",
            namespace="qa_live_1",
            asset_type="cube",
            asset_key="student_comment",
        )
    )
    revision_v1 = repo.append_revision(asset.id, {"cube": {"name": "student_comment", "v": 1}})
    release_v1 = release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision_v1.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_1",
    )
    revision_v2 = repo.append_revision(
        asset.id,
        {"cube": {"name": "student_comment", "v": 2}},
        force_new_revision=True,
    )
    release_service.publish(
        namespace="qa_live_1",
        revision_ids=[revision_v2.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_2",
    )

    rollback = release_service.rollback_to(
        namespace="qa_live_1",
        release_id=release_v1.id,
        actor="alice",
        idempotency_key="rollback_1",
    )

    assert rollback.status == "published"
    assert rollback.release_no == 3
    assert rollback.rollback_of_release_id == release_v1.id
    active = repo.get_active_snapshot("qa_live_1")
    assert active.release_id == rollback.id
    assert repo.resolve_asset(active.id, "cube", "student_comment").revision_id == revision_v1.id
