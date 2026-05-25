from __future__ import annotations

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.sql_repository import (
    SqlAgentInferenceRuntimeRepository,
)


def test_sql_runtime_repository_round_trips_run_and_artifact(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = RuntimeContextRef(
        project_id="cubic3-data-platform",
        session_id="session_1",
        thread_id="thread_1",
        turn_id="turn_1",
    )
    run = AgentInferenceRuntimeRun(
        run_id="run_1",
        app_id="semantic_modeling",
        action="semantic.modeling.chat",
        runtime_name="openai_compatible",
        status="succeeded",
        runtime_context_ref=ref,
        principal_id="alice",
        provider_ref={"provider_run_id": "provider_1"},
        usage={"total_tokens": 12},
    )
    artifact = AgentInferenceRuntimeArtifact(
        artifact_id="artifact_1",
        run_id="run_1",
        artifact_type="json",
        title="结构化输出",
        summary="候选语义结果",
        mime_type="application/json",
        size_bytes=42,
        sha256="abc123",
    )

    repo.save_run(run)
    repo.save_artifact(artifact, context_ref=ref, app_id="semantic_modeling", principal_id="alice")

    loaded = repo.get_run("run_1")
    assert loaded is not None
    assert loaded.status == "succeeded"
    assert loaded.runtime_context_ref.turn_id == "turn_1"
    assert loaded.provider_ref == {"provider_run_id": "provider_1"}

    artifacts = repo.list_artifacts(run_id="run_1", principal_id="alice")
    assert [item.artifact_id for item in artifacts] == ["artifact_1"]
    assert repo.list_artifacts(run_id="run_1", principal_id="bob") == []
