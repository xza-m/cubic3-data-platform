from __future__ import annotations

from datetime import datetime, timezone

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
from app.shared.utils.time import utcnow


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
        run_row = self.session.get(AgentInferenceRuntimeRunORM, artifact.run_id)
        if run_row is None:
            raise ValueError(f"run not found: {artifact.run_id}")
        if not self._run_matches_owner(
            run_row,
            context_ref=context_ref,
            app_id=app_id,
            principal_id=principal_id,
        ):
            raise ValueError(f"artifact run ownership mismatch: {artifact.run_id}")

        row = self.session.get(AgentInferenceRuntimeArtifactORM, artifact.artifact_id)
        if row is None:
            row = AgentInferenceRuntimeArtifactORM(artifact_id=artifact.artifact_id)
            self.session.add(row)
        elif not self._artifact_matches_owner(
            row,
            run_id=artifact.run_id,
            context_ref=context_ref,
            app_id=app_id,
            principal_id=principal_id,
        ):
            raise ValueError(f"artifact ownership mismatch: {artifact.artifact_id}")

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
        row.storage_uri = artifact.storage_uri
        row.expires_at = artifact.expires_at
        row.download_name = artifact.download_name
        self.session.commit()

    def list_artifacts(
        self,
        *,
        run_id: str,
        principal_id: str | None,
        app_id: str | None = None,
    ) -> list[AgentInferenceRuntimeArtifact]:
        run_row = self.session.get(AgentInferenceRuntimeRunORM, run_id)
        if run_row is None:
            return []
        if run_row.principal_id != principal_id:
            return []
        if app_id is not None and run_row.app_id != app_id:
            return []

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

    def get_artifact_for_download(
        self,
        *,
        run_id: str,
        artifact_id: str,
        principal_id: str | None,
    ) -> AgentInferenceRuntimeArtifact | None:
        if not principal_id:
            return None
        row = (
            self.session.query(AgentInferenceRuntimeArtifactORM)
            .filter(
                AgentInferenceRuntimeArtifactORM.artifact_id == artifact_id,
                AgentInferenceRuntimeArtifactORM.run_id == run_id,
                AgentInferenceRuntimeArtifactORM.principal_id == principal_id,
            )
            .one_or_none()
        )
        if row is None or not row.storage_uri:
            return None
        if _is_expired(row.expires_at):
            return None
        run_row = self.session.get(AgentInferenceRuntimeRunORM, run_id)
        if run_row is None or run_row.principal_id != principal_id:
            return None
        return self._artifact_from_row(row)

    def _run_matches_owner(
        self,
        row: AgentInferenceRuntimeRunORM,
        *,
        context_ref: RuntimeContextRef,
        app_id: str,
        principal_id: str | None,
    ) -> bool:
        return (
            row.app_id == app_id
            and row.principal_id == principal_id
            and row.project_id == context_ref.project_id
            and row.session_id == context_ref.session_id
            and row.thread_id == context_ref.thread_id
            and row.turn_id == context_ref.turn_id
        )

    def _artifact_matches_owner(
        self,
        row: AgentInferenceRuntimeArtifactORM,
        *,
        run_id: str,
        context_ref: RuntimeContextRef,
        app_id: str,
        principal_id: str | None,
    ) -> bool:
        return (
            row.run_id == run_id
            and row.app_id == app_id
            and row.principal_id == principal_id
            and row.project_id == context_ref.project_id
            and row.session_id == context_ref.session_id
            and row.thread_id == context_ref.thread_id
            and row.turn_id == context_ref.turn_id
        )

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
            runtime_context_ref=RuntimeContextRef(
                project_id=row.project_id,
                session_id=row.session_id,
                thread_id=row.thread_id,
                turn_id=row.turn_id,
            ),
            storage_uri=row.storage_uri,
            expires_at=row.expires_at,
            download_name=row.download_name,
        )


def _is_expired(expires_at: datetime | None) -> bool:
    if expires_at is None:
        return False
    current = utcnow()
    candidate = expires_at
    if candidate.tzinfo is None:
        candidate = candidate.replace(tzinfo=timezone.utc)
    return candidate <= current
