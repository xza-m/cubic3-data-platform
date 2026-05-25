from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.models import (
    AgentInferenceRuntimeArtifactORM,
    AgentInferenceRuntimeRunORM,
)


class SqlAgentInferenceRuntimeRepository:
    """Agent 推理 Runtime SQL 仓储。"""

    def __init__(self, session: Session):
        self.session = session

    def save_run(self, run: AgentInferenceRuntimeRun) -> None:
        row = self.session.get(AgentInferenceRuntimeRunORM, run.run_id)
        if row is None:
            row = AgentInferenceRuntimeRunORM(run_id=run.run_id)
            self.session.add(row)

        ref = run.runtime_context_ref
        row.app_id = run.app_id
        row.action = run.action
        row.runtime_name = run.runtime_name
        row.status = run.status
        row.project_id = ref.project_id
        row.session_id = ref.session_id
        row.thread_id = ref.thread_id
        row.turn_id = ref.turn_id
        row.principal_id = run.principal_id
        row.provider_ref_json = dict(run.provider_ref) if run.provider_ref is not None else None
        row.usage_json = dict(run.usage)
        row.error_json = dict(run.error) if run.error is not None else None
        self.session.commit()

    def get_run(self, run_id: str) -> AgentInferenceRuntimeRun | None:
        row = self.session.get(AgentInferenceRuntimeRunORM, run_id)
        if row is None:
            return None
        return self._run_from_row(row)

    def save_artifact(
        self,
        artifact: AgentInferenceRuntimeArtifact,
        *,
        context_ref: RuntimeContextRef,
        app_id: str,
        principal_id: str | None,
    ) -> None:
        row = self.session.get(AgentInferenceRuntimeArtifactORM, artifact.artifact_id)
        if row is None:
            row = AgentInferenceRuntimeArtifactORM(artifact_id=artifact.artifact_id)
            self.session.add(row)

        row.run_id = artifact.run_id
        row.app_id = app_id
        row.principal_id = principal_id
        row.project_id = context_ref.project_id
        row.session_id = context_ref.session_id
        row.thread_id = context_ref.thread_id
        row.turn_id = context_ref.turn_id
        row.artifact_type = artifact.artifact_type
        row.title = artifact.title
        row.summary = artifact.summary
        row.mime_type = artifact.mime_type
        row.size_bytes = artifact.size_bytes
        row.sha256 = artifact.sha256
        self.session.commit()

    def list_artifacts(
        self,
        *,
        run_id: str,
        principal_id: str | None,
    ) -> list[AgentInferenceRuntimeArtifact]:
        rows = (
            self.session.query(AgentInferenceRuntimeArtifactORM)
            .filter(
                AgentInferenceRuntimeArtifactORM.run_id == run_id,
                AgentInferenceRuntimeArtifactORM.principal_id == principal_id,
            )
            .order_by(
                AgentInferenceRuntimeArtifactORM.created_at.asc(),
                AgentInferenceRuntimeArtifactORM.artifact_id.asc(),
            )
            .all()
        )
        return [self._artifact_from_row(row) for row in rows]

    def _run_from_row(self, row: AgentInferenceRuntimeRunORM) -> AgentInferenceRuntimeRun:
        return AgentInferenceRuntimeRun(
            run_id=row.run_id,
            app_id=row.app_id,
            action=row.action,
            runtime_name=row.runtime_name,
            status=row.status,
            runtime_context_ref=RuntimeContextRef(
                project_id=row.project_id,
                session_id=row.session_id,
                thread_id=row.thread_id,
                turn_id=row.turn_id,
            ),
            principal_id=row.principal_id,
            provider_ref=dict(row.provider_ref_json) if row.provider_ref_json is not None else None,
            usage=dict(row.usage_json or {}),
            error=dict(row.error_json) if row.error_json is not None else None,
        )

    def _artifact_from_row(
        self,
        row: AgentInferenceRuntimeArtifactORM,
    ) -> AgentInferenceRuntimeArtifact:
        return AgentInferenceRuntimeArtifact(
            artifact_id=row.artifact_id,
            run_id=row.run_id,
            artifact_type=row.artifact_type,
            title=row.title,
            summary=row.summary,
            mime_type=row.mime_type,
            size_bytes=int(row.size_bytes),
            sha256=row.sha256,
        )
