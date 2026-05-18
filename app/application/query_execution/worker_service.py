from __future__ import annotations

from datetime import timedelta
from typing import Any

from app.application.query_execution.ticket_service import ExecutionTicketService
from app.domain.query_execution.enums import QueryJobStatus, QueryRouteType
from app.infrastructure.query_execution.repositories import QueryExecutionRepository
from app.infrastructure.query_execution.result_store import LocalSpoolResultStore
from app.shared.utils.time import utcnow


class QueryExecutionWorkerService:
    """查询执行 Worker 的单 job 状态机。"""

    def __init__(
        self,
        *,
        repository: QueryExecutionRepository,
        ticket_service: ExecutionTicketService,
        adapter,
        result_store: LocalSpoolResultStore,
        lease_seconds: int = 300,
        max_submit_attempts: int = 3,
    ):
        self.repository = repository
        self.ticket_service = ticket_service
        self.adapter = adapter
        self.result_store = result_store
        self.lease_seconds = lease_seconds
        self.max_submit_attempts = max(1, int(max_submit_attempts or 1))

    def process_next(self, *, worker_id: str):
        job = self.repository.claim_next_query(
            worker_id=worker_id,
            lease_until=self._lease_until(),
        )
        if job is None:
            return None

        issues = self.ticket_service.validate_snapshot_for_job(
            snapshot=job.ticket_snapshot_json or {},
            principal_id=job.principal_id,
            source_id=job.source_id,
            sql_hash=job.sql_hash,
            resource_set=job.resource_set_json,
        )
        if issues:
            return self.repository.fail_job(
                query_id=job.id,
                error_code="INVALID_TICKET_SNAPSHOT",
                error_message="Execution ticket snapshot does not match query job",
                payload={"issues": issues},
            )
        snapshot_issues = self._validate_agent_semantic_snapshot(job)
        if snapshot_issues:
            return self.repository.fail_job(
                query_id=job.id,
                error_code="INVALID_AGENT_SEMANTIC_SNAPSHOT",
                error_message="Agent semantic query job snapshot is incomplete",
                payload={"issues": snapshot_issues},
            )

        try:
            if not self._renew_or_stop(query_id=job.id, worker_id=worker_id):
                return self.repository.get_by_id(job.id)

            if job.cancel_requested:
                return self._cancel_claimed_job(job)

            engine_query_id = job.engine_query_id
            if engine_query_id:
                job = self.repository.transition_status(
                    job.id,
                    QueryJobStatus.RUNNING.value,
                    event_type="job_recovered_running",
                    payload={"engine_query_id": engine_query_id},
                )
            else:
                job = self.repository.transition_status(
                    job.id,
                    QueryJobStatus.SUBMITTING.value,
                    event_type="job_submitting",
                )
                if self._job_cancel_requested(job.id):
                    return self._cancel_claimed_job(job)
                engine_query_id = self._submit_with_retry(job)
                self.repository.mark_engine_submitted(query_id=job.id, engine_query_id=engine_query_id)
                job = self.repository.transition_status(
                    job.id,
                    QueryJobStatus.RUNNING.value,
                    event_type="job_running",
                    payload={"engine_query_id": engine_query_id},
                )

            if not self._renew_or_stop(query_id=job.id, worker_id=worker_id):
                return self.repository.get_by_id(job.id)

            engine_status = str(self.adapter.get_status(engine_query_id)).upper()
            if self._job_cancel_requested(job.id):
                return self._cancel_engine_query(query_id=job.id, engine_query_id=engine_query_id)
            if engine_status in {"FAILED", "ERROR"}:
                return self.repository.fail_job(
                    query_id=job.id,
                    error_code="ENGINE_QUERY_FAILED",
                    error_message="Warehouse engine query failed",
                    payload={"engine_query_id": engine_query_id, "engine_status": engine_status},
                )
            if engine_status in {"CANCELED", "CANCELLED"}:
                return self.repository.transition_status(
                    job.id,
                    QueryJobStatus.CANCELED.value,
                    event_type="job_canceled",
                    payload={"engine_query_id": engine_query_id},
                )

            if not self._renew_or_stop(query_id=job.id, worker_id=worker_id):
                return self.repository.get_by_id(job.id)
            job = self.repository.transition_status(job.id, QueryJobStatus.FETCHING.value, event_type="job_fetching")
            fetched = self.adapter.fetch_result(engine_query_id)
            columns, rows = self._normalize_fetch_result(fetched)
            if not self._renew_or_stop(query_id=job.id, worker_id=worker_id):
                return self.repository.get_by_id(job.id)
            job = self.repository.transition_status(job.id, QueryJobStatus.PERSISTING.value, event_type="job_persisting")
            stored = self.result_store.persist_rows(query_id=job.id, columns=columns, rows=rows)
            self.repository.upsert_result_object(
                query_id=job.id,
                status=stored.status,
                storage_type="local",
                content_type=stored.content_type,
                file_path=stored.relative_path,
                row_count=stored.row_count,
                byte_size=stored.byte_size,
                sha256=stored.sha256,
                preview=stored.preview_json,
                expires_at=stored.expires_at,
                ready_at=utcnow(),
            )
            return self.repository.transition_status(job.id, QueryJobStatus.SUCCEEDED.value, event_type="job_succeeded")
        except Exception as exc:
            return self.repository.fail_job(
                query_id=job.id,
                error_code=getattr(exc, "code", "QUERY_EXECUTION_FAILED"),
                error_message=str(exc),
            )

    def _renew_or_stop(self, *, query_id: str, worker_id: str) -> bool:
        return self.repository.renew_lease(
            query_id=query_id,
            worker_id=worker_id,
            lease_until=self._lease_until(),
        )

    def _lease_until(self):
        return utcnow() + timedelta(seconds=self.lease_seconds)

    def _job_cancel_requested(self, query_id: str) -> bool:
        job = self.repository.get_by_id(query_id)
        return bool(job and job.cancel_requested)

    def _cancel_claimed_job(self, job):
        if job.engine_query_id:
            return self._cancel_engine_query(query_id=job.id, engine_query_id=job.engine_query_id)
        return self.repository.transition_status(
            job.id,
            QueryJobStatus.CANCELED.value,
            event_type="job_canceled",
            payload={"cancel_requested": True},
        )

    def _cancel_engine_query(self, *, query_id: str, engine_query_id: str):
        self.adapter.cancel(engine_query_id)
        return self.repository.transition_status(
            query_id,
            QueryJobStatus.CANCELED.value,
            event_type="job_canceled",
            payload={"engine_query_id": engine_query_id, "cancel_requested": True},
        )

    def _submit_with_retry(self, job) -> str:
        last_exc: Exception | None = None
        for attempt in range(1, self.max_submit_attempts + 1):
            try:
                return self.adapter.submit(source_id=job.source_id, sql=job.validated_sql)
            except Exception as exc:
                last_exc = exc
                retryable = bool(getattr(exc, "retryable", False))
                if not retryable or attempt >= self.max_submit_attempts:
                    raise
                self.repository.transition_status(
                    job.id,
                    QueryJobStatus.SUBMITTING.value,
                    event_type="job_submit_retry",
                    payload={
                        "attempt": attempt,
                        "max_attempts": self.max_submit_attempts,
                        "error_code": getattr(exc, "code", "QUERY_SUBMIT_FAILED"),
                        "error_message": str(exc),
                    },
                )
        raise last_exc or RuntimeError("query submit failed")

    @staticmethod
    def _normalize_fetch_result(fetched: Any) -> tuple[list[str], list[dict[str, Any]]]:
        if isinstance(fetched, dict):
            columns = fetched.get("columns") or []
            rows = fetched.get("rows") or []
            if columns and isinstance(columns[0], dict):
                columns = [column.get("name") for column in columns]
            normalized_rows = []
            for row in rows:
                if isinstance(row, dict):
                    normalized_rows.append(row)
                else:
                    normalized_rows.append({columns[index]: value for index, value in enumerate(row)})
            return list(columns), normalized_rows
        raise ValueError("adapter fetch_result must return {'columns': ..., 'rows': ...}")

    @staticmethod
    def _validate_agent_semantic_snapshot(job) -> list[str]:
        if job.route_type != QueryRouteType.AGENT_SEMANTIC.value:
            return []
        issues: list[str] = []
        snapshot = job.governance_snapshot_json or {}
        query_dsl = snapshot.get("query_dsl")
        if not isinstance(query_dsl, dict):
            issues.append("missing query_dsl")
        elif query_dsl.get("dsl_version") != "v1":
            issues.append("query_dsl.dsl_version must be v1")
        return issues
