from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domain.query_execution.enums import QueryJobStatus
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.shared.exceptions import EntityNotFoundError, InvalidOperationError
from app.shared.utils.time import utcnow


_TERMINAL = {
    QueryJobStatus.SUCCEEDED.value,
    QueryJobStatus.FAILED.value,
    QueryJobStatus.CANCELED.value,
}


class QueryResultService:
    """查询执行状态、事件、结果和取消服务。"""

    def __init__(self, *, repository: QueryExecutionRepository):
        self.repository = repository

    def get_job(self, *, query_id: str, principal_id: str) -> dict[str, Any]:
        job = self._get_job_orm(query_id=query_id, principal_id=principal_id)
        return self._job_to_dict(job)

    def list_events(self, *, query_id: str, principal_id: str) -> dict[str, Any]:
        self._get_job_orm(query_id=query_id, principal_id=principal_id)
        events = self.repository.list_events(query_id)
        return {
            "items": [
                {
                    "id": event.id,
                    "query_id": event.query_id,
                    "event_type": event.event_type,
                    "from_status": event.from_status,
                    "to_status": event.to_status,
                    "payload": event.payload_json or {},
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                }
                for event in events
            ]
        }

    def get_result_metadata(self, *, query_id: str, principal_id: str) -> dict[str, Any]:
        self._get_job_orm(query_id=query_id, principal_id=principal_id)
        result = self.repository.get_result_by_query_id(query_id)
        if result is None:
            raise EntityNotFoundError(
                f"Query result {query_id} not found",
                code="QUERY_RESULT_NOT_FOUND",
                details={"query_id": query_id},
            )
        return {
            "query_id": result.query_id,
            "status": result.status,
            "storage_type": result.storage_type,
            "content_type": result.content_type,
            "row_count": result.row_count,
            "byte_size": result.byte_size,
            "sha256": result.sha256,
            "preview": result.preview_json or {},
            "expires_at": result.expires_at.isoformat() if result.expires_at else None,
            "ready_at": result.ready_at.isoformat() if result.ready_at else None,
        }

    def cancel(self, *, query_id: str, principal_id: str):
        job = self.repository.get_job_for_principal(query_id, principal_id)
        if job is None:
            raise EntityNotFoundError(
                f"Query job {query_id} not found",
                code="QUERY_JOB_NOT_FOUND",
                details={"query_id": query_id},
            )
        if job.status in _TERMINAL:
            raise InvalidOperationError(
                f"Query job {query_id} not cancellable at status {job.status}",
                code="QUERY_JOB_NOT_CANCELLABLE",
                details={"query_id": query_id, "status": job.status},
            )
        return self.repository.cancel_job(query_id)

    def cleanup_expired_results(
        self,
        *,
        result_store,
        now: datetime | None = None,
        limit: int = 100,
    ) -> dict[str, int]:
        expired = 0
        failed = 0
        for result in self.repository.list_expired_ready_results(now=now or utcnow(), limit=limit):
            try:
                if result.storage_type == "local" and result.file_path:
                    result_store.delete_relative_path(result.file_path)
                self.repository.expire_result_object(
                    query_id=result.query_id,
                    payload={"storage_type": result.storage_type, "file_path": result.file_path},
                )
                expired += 1
            except Exception as exc:  # pragma: no cover - defensive cleanup path
                failed += 1
                self.repository.record_result_cleanup_failed(
                    query_id=result.query_id,
                    error_message=str(exc),
                    payload={"storage_type": result.storage_type, "file_path": result.file_path},
                )
        return {"expired": expired, "failed": failed}

    def _get_job_orm(self, *, query_id: str, principal_id: str):
        job = self.repository.get_job_for_principal(query_id, principal_id)
        if job is None:
            raise EntityNotFoundError(
                f"Query job {query_id} not found",
                code="QUERY_JOB_NOT_FOUND",
                details={"query_id": query_id},
            )
        return job

    @staticmethod
    def _job_to_dict(job) -> dict[str, Any]:
        return {
            "id": job.id,
            "query_id": job.id,
            "trace_id": job.trace_id,
            "principal_id": job.principal_id,
            "route_type": job.route_type,
            "semantic_plan_id": job.semantic_plan_id,
            "source_id": job.source_id,
            "project_name": job.project_name,
            "logical_sql": job.logical_sql,
            "validated_sql": job.validated_sql,
            "sql_hash": job.sql_hash,
            "resource_set": job.resource_set_json or {},
            "data_level": job.data_level,
            "status": job.status,
            "engine_query_id": job.engine_query_id,
            "cancel_requested": job.cancel_requested,
            "error_code": job.error_code,
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }
