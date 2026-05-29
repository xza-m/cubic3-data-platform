from __future__ import annotations

from datetime import timedelta

import pytest

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.sql_repository import (
    SqlAgentInferenceRuntimeRepository,
)
from app.shared.utils.time import utcnow


def _runtime_context_ref(
    *,
    project_id: str = "cubic3-data-platform",
    session_id: str = "session_1",
    thread_id: str = "thread_1",
    turn_id: str = "turn_1",
) -> RuntimeContextRef:
    return RuntimeContextRef(
        project_id=project_id,
        session_id=session_id,
        thread_id=thread_id,
        turn_id=turn_id,
    )


def _runtime_run(
    *,
    run_id: str = "run_1",
    ref: RuntimeContextRef | None = None,
    app_id: str = "semantic_modeling",
    principal_id: str | None = "alice",
) -> AgentInferenceRuntimeRun:
    return AgentInferenceRuntimeRun(
        run_id=run_id,
        app_id=app_id,
        action="semantic.modeling.chat",
        runtime_name="openai_compatible",
        status="succeeded",
        runtime_context_ref=ref or _runtime_context_ref(),
        principal_id=principal_id,
        provider_ref={"provider_run_id": "provider_1"},
        usage={"total_tokens": 12},
    )


def _runtime_artifact(
    *,
    artifact_id: str = "artifact_1",
    run_id: str = "run_1",
    size_bytes: int = 42,
    storage_uri: str | None = (
        "codex-workspace://projects/cubic3-data-platform/sessions/session_1/"
        "threads/thread_1/turns/turn_1/runs/run_1/artifacts/artifact_1/result.json"
    ),
    expires_at=None,
) -> AgentInferenceRuntimeArtifact:
    return AgentInferenceRuntimeArtifact(
        artifact_id=artifact_id,
        run_id=run_id,
        artifact_type="json",
        title="结构化输出",
        summary="候选语义结果",
        mime_type="application/json",
        size_bytes=size_bytes,
        sha256="sha256:abc123",
        storage_uri=storage_uri,
        expires_at=expires_at,
        download_name="result.json",
    )


def test_sql_runtime_repository_round_trips_run_and_artifact(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = _runtime_context_ref()
    run = _runtime_run(ref=ref)
    artifact = _runtime_artifact()

    repo.save_run(run)
    repo.save_artifact(artifact, context_ref=ref, app_id="semantic_modeling", principal_id="alice")

    loaded = repo.get_run("run_1")
    assert loaded is not None
    assert loaded.status == "succeeded"
    assert loaded.runtime_context_ref.turn_id == "turn_1"
    assert loaded.provider_ref == {"provider_run_id": "provider_1"}

    artifacts = repo.list_artifacts(run_id="run_1", principal_id="alice")
    assert [item.artifact_id for item in artifacts] == ["artifact_1"]
    assert artifacts[0].storage_uri is not None
    assert artifacts[0].download_name == "result.json"
    assert artifacts[0].runtime_context_ref == ref
    assert repo.list_artifacts(run_id="run_1", principal_id="bob") == []

    download = repo.get_artifact_for_download(
        run_id="run_1",
        artifact_id="artifact_1",
        principal_id="alice",
    )
    assert download is not None
    assert download.storage_uri == artifact.storage_uri
    assert download.sha256 == "sha256:abc123"
    assert download.runtime_context_ref == ref


def test_save_artifact_rejects_duplicate_id_with_different_owner(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = _runtime_context_ref()
    other_ref = _runtime_context_ref(turn_id="turn_2")
    repo.save_run(_runtime_run(run_id="run_1", ref=ref, principal_id="alice"))
    repo.save_run(_runtime_run(run_id="run_2", ref=other_ref, principal_id="bob"))
    repo.save_artifact(
        _runtime_artifact(artifact_id="artifact_1", run_id="run_1"),
        context_ref=ref,
        app_id="semantic_modeling",
        principal_id="alice",
    )

    with pytest.raises(ValueError, match="artifact ownership mismatch"):
        repo.save_artifact(
            _runtime_artifact(artifact_id="artifact_1", run_id="run_2"),
            context_ref=other_ref,
            app_id="semantic_modeling",
            principal_id="bob",
        )


def test_save_artifact_rejects_missing_run(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)

    with pytest.raises(ValueError, match="run not found"):
        repo.save_artifact(
            _runtime_artifact(run_id="missing_run"),
            context_ref=_runtime_context_ref(),
            app_id="semantic_modeling",
            principal_id="alice",
        )


def test_list_artifacts_returns_empty_for_wrong_app_id(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = _runtime_context_ref()
    repo.save_run(_runtime_run(ref=ref, app_id="semantic_modeling", principal_id="alice"))
    repo.save_artifact(
        _runtime_artifact(),
        context_ref=ref,
        app_id="semantic_modeling",
        principal_id="alice",
    )

    assert (
        repo.list_artifacts(
            run_id="run_1",
            principal_id="alice",
            app_id="other_app",
        )
        == []
    )


def test_sql_runtime_repository_round_trips_large_artifact_size(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = _runtime_context_ref()
    repo.save_run(_runtime_run(ref=ref))
    repo.save_artifact(
        _runtime_artifact(size_bytes=3_000_000_000),
        context_ref=ref,
        app_id="semantic_modeling",
        principal_id="alice",
    )

    artifacts = repo.list_artifacts(run_id="run_1", principal_id="alice")
    assert artifacts[0].size_bytes == 3_000_000_000


def test_get_artifact_for_download_returns_none_for_wrong_owner_or_run(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = _runtime_context_ref()
    repo.save_run(_runtime_run(ref=ref, principal_id="alice"))
    repo.save_artifact(
        _runtime_artifact(),
        context_ref=ref,
        app_id="semantic_modeling",
        principal_id="alice",
    )

    assert (
        repo.get_artifact_for_download(
            run_id="run_1",
            artifact_id="artifact_1",
            principal_id="bob",
        )
        is None
    )
    assert (
        repo.get_artifact_for_download(
            run_id="other_run",
            artifact_id="artifact_1",
            principal_id="alice",
        )
        is None
    )


def test_get_artifact_for_download_returns_none_for_expired_artifact(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = _runtime_context_ref()
    repo.save_run(_runtime_run(ref=ref, principal_id="alice"))
    repo.save_artifact(
        _runtime_artifact(expires_at=utcnow() - timedelta(seconds=1)),
        context_ref=ref,
        app_id="semantic_modeling",
        principal_id="alice",
    )

    assert (
        repo.get_artifact_for_download(
            run_id="run_1",
            artifact_id="artifact_1",
            principal_id="alice",
        )
        is None
    )
