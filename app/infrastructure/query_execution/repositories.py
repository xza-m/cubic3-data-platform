from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.domain.query_execution.enums import QueryJobStatus, ResultObjectStatus
from app.infrastructure.query_execution.models import (
    QueryExecutionEventORM,
    QueryExecutionJobORM,
    QueryResultObjectORM,
)
from app.shared.utils.time import utcnow


class QueryExecutionRepository:
    """查询执行 PostgreSQL job queue 仓储。"""

    _RECOVERABLE_STATUSES = (
        QueryJobStatus.CLAIMED.value,
        QueryJobStatus.SUBMITTING.value,
        QueryJobStatus.RUNNING.value,
        QueryJobStatus.FETCHING.value,
        QueryJobStatus.PERSISTING.value,
        QueryJobStatus.CANCELING.value,
    )
    _TERMINAL_STATUSES = (
        QueryJobStatus.SUCCEEDED.value,
        QueryJobStatus.FAILED.value,
        QueryJobStatus.CANCELED.value,
    )

    def __init__(self, session: Session):
        self.session = session

    def create_job(
        self,
        *,
        job_id: str,
        trace_id: str,
        principal_id: str,
        route_type: str,
        source_id: int,
        logical_sql: str,
        validated_sql: str,
        sql_hash: str,
        resource_set: list[dict[str, Any]],
        ticket_snapshot: dict[str, Any],
        data_level: str = "M1",
        semantic_plan_id: str | None = None,
        project_name: str | None = None,
        governance_snapshot: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> QueryExecutionJobORM:
        existing = self.find_by_idempotency(principal_id, idempotency_key)
        if existing is not None:
            return existing

        job = QueryExecutionJobORM(
            id=job_id,
            trace_id=trace_id,
            principal_id=principal_id,
            route_type=route_type,
            semantic_plan_id=semantic_plan_id,
            source_id=source_id,
            project_name=project_name,
            logical_sql=logical_sql,
            validated_sql=validated_sql,
            sql_hash=sql_hash,
            resource_set_json=resource_set,
            data_level=data_level,
            ticket_snapshot_json=ticket_snapshot,
            governance_snapshot_json=governance_snapshot or {},
            idempotency_key=idempotency_key,
            status=QueryJobStatus.QUEUED.value,
        )
        self.session.add(job)
        self.session.flush()
        self._append_event(
            query_id=job.id,
            event_type="job_created",
            from_status=None,
            to_status=job.status,
        )
        self.session.commit()
        self.session.refresh(job)
        return job

    def mark_engine_submitted(self, *, query_id: str, engine_query_id: str) -> QueryExecutionJobORM:
        job = self.get_by_id(query_id)
        if job is None:
            raise ValueError(f"query job not found: {query_id}")
        job.engine_query_id = engine_query_id
        job.submitted_at = utcnow()
        self.session.commit()
        self.session.refresh(job)
        return job

    def fail_job(
        self,
        *,
        query_id: str,
        error_code: str,
        error_message: str,
        payload: dict[str, Any] | None = None,
    ) -> QueryExecutionJobORM:
        job = self.get_by_id(query_id)
        if job is None:
            raise ValueError(f"query job not found: {query_id}")
        from_status = job.status
        job.status = QueryJobStatus.FAILED.value
        job.error_code = error_code
        job.error_message = error_message
        job.finished_at = utcnow()
        self._append_event(
            query_id=query_id,
            event_type="job_failed",
            from_status=from_status,
            to_status=job.status,
            payload={"error_code": error_code, "error_message": error_message, **(payload or {})},
        )
        self.session.commit()
        self.session.refresh(job)
        return job

    def get_by_id(self, query_id: str) -> QueryExecutionJobORM | None:
        return (
            self.session.query(QueryExecutionJobORM)
            .filter(QueryExecutionJobORM.id == query_id)
            .first()
        )

    def get_job_for_principal(self, query_id: str, principal_id: str) -> QueryExecutionJobORM | None:
        return (
            self.session.query(QueryExecutionJobORM)
            .filter(
                QueryExecutionJobORM.id == query_id,
                QueryExecutionJobORM.principal_id == principal_id,
            )
            .first()
        )

    def find_for_principal(self, query_id: str, principal_id: str) -> QueryExecutionJobORM | None:
        return self.get_job_for_principal(query_id, principal_id)

    def find_by_idempotency(
        self,
        principal_id: str,
        idempotency_key: str | None,
    ) -> QueryExecutionJobORM | None:
        if not idempotency_key:
            return None
        return (
            self.session.query(QueryExecutionJobORM)
            .filter(
                QueryExecutionJobORM.principal_id == principal_id,
                QueryExecutionJobORM.idempotency_key == idempotency_key,
            )
            .first()
        )

    def claim_next_query(
        self,
        *,
        worker_id: str,
        lease_until: datetime,
    ) -> QueryExecutionJobORM | None:
        now = utcnow()
        query = (
            self.session.query(QueryExecutionJobORM)
            .filter(
                or_(
                    QueryExecutionJobORM.status == QueryJobStatus.QUEUED.value,
                    and_(
                        QueryExecutionJobORM.status.in_(self._RECOVERABLE_STATUSES),
                        or_(
                            QueryExecutionJobORM.lease_expires_at.is_(None),
                            QueryExecutionJobORM.lease_expires_at <= now,
                        ),
                    ),
                )
            )
            .order_by(QueryExecutionJobORM.created_at.asc())
        )
        bind = self.session.get_bind()
        if bind.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        job = query.first()
        if job is None:
            self.session.rollback()
            return None

        from_status = job.status
        job.status = QueryJobStatus.CLAIMED.value
        job.lease_owner = worker_id
        job.lease_expires_at = lease_until
        is_recovered = from_status != QueryJobStatus.QUEUED.value
        self._append_event(
            query_id=job.id,
            event_type="job_recovered" if is_recovered else "job_claimed",
            from_status=from_status,
            to_status=job.status,
            payload={
                "worker_id": worker_id,
                **({"recovered_from_status": from_status} if is_recovered else {}),
            },
        )
        self.session.commit()
        self.session.refresh(job)
        return job

    def transition_status(
        self,
        query_id: str,
        next_status: str,
        *,
        event_type: str,
        payload: dict[str, Any] | None = None,
    ) -> QueryExecutionJobORM:
        job = self.get_by_id(query_id)
        if job is None:
            raise ValueError(f"query job not found: {query_id}")
        from_status = job.status
        job.status = next_status
        self._append_event(
            query_id=query_id,
            event_type=event_type,
            from_status=from_status,
            to_status=next_status,
            payload=payload,
        )
        self.session.commit()
        self.session.refresh(job)
        return job

    def cancel_job(self, query_id: str) -> QueryExecutionJobORM:
        job = self.get_by_id(query_id)
        if job is None:
            raise ValueError(f"query job not found: {query_id}")
        if job.engine_query_id:
            from_status = job.status
            job.cancel_requested = True
            job.status = QueryJobStatus.CANCELING.value
            next_status = job.status
            event_type = "job_cancel_requested"
        else:
            from_status = job.status
            job.cancel_requested = True
            job.status = QueryJobStatus.CANCELED.value
            job.finished_at = utcnow()
            next_status = job.status
            event_type = "job_canceled"
        self._append_event(
            query_id=query_id,
            event_type=event_type,
            from_status=from_status,
            to_status=next_status,
            payload={"cancel_requested": True},
        )
        self.session.commit()
        self.session.refresh(job)
        return job

    def renew_lease(
        self,
        *,
        query_id: str,
        worker_id: str,
        lease_until: datetime,
    ) -> bool:
        job = self.get_by_id(query_id)
        if job is None or job.lease_owner != worker_id or job.status in self._TERMINAL_STATUSES:
            self.session.rollback()
            return False
        job.lease_expires_at = lease_until
        self.session.commit()
        return True

    def get_result_by_query_id(self, query_id: str) -> QueryResultObjectORM | None:
        return (
            self.session.query(QueryResultObjectORM)
            .filter(QueryResultObjectORM.query_id == query_id)
            .first()
        )

    def list_expired_ready_results(
        self,
        *,
        now: datetime,
        limit: int = 100,
    ) -> list[QueryResultObjectORM]:
        return (
            self.session.query(QueryResultObjectORM)
            .filter(
                QueryResultObjectORM.status == ResultObjectStatus.READY.value,
                QueryResultObjectORM.expires_at.isnot(None),
                QueryResultObjectORM.expires_at <= now,
            )
            .order_by(QueryResultObjectORM.expires_at.asc(), QueryResultObjectORM.id.asc())
            .limit(limit)
            .all()
        )

    def expire_result_object(self, *, query_id: str, payload: dict[str, Any] | None = None) -> QueryResultObjectORM:
        result = self.get_result_by_query_id(query_id)
        if result is None:
            raise ValueError(f"query result not found: {query_id}")
        from_status = result.status
        result.status = ResultObjectStatus.EXPIRED.value
        self._append_event(
            query_id=query_id,
            event_type="result_expired",
            from_status=from_status,
            to_status=result.status,
            payload=payload,
        )
        self.session.commit()
        self.session.refresh(result)
        return result

    def record_result_cleanup_failed(
        self,
        *,
        query_id: str,
        error_message: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self._append_event(
            query_id=query_id,
            event_type="result_cleanup_failed",
            from_status=None,
            to_status=None,
            payload={"error_message": error_message, **(payload or {})},
        )
        self.session.commit()

    def upsert_result_object(
        self,
        *,
        query_id: str,
        status: str,
        storage_type: str = "local",
        content_type: str = "text/csv",
        file_path: str | None = None,
        row_count: int = 0,
        byte_size: int = 0,
        sha256: str | None = None,
        preview: dict[str, Any] | None = None,
        expires_at: datetime | None = None,
        ready_at: datetime | None = None,
    ) -> QueryResultObjectORM:
        result = self.get_result_by_query_id(query_id)
        if result is None:
            result = QueryResultObjectORM(query_id=query_id)
            self.session.add(result)
        result.status = status
        result.storage_type = storage_type
        result.content_type = content_type
        result.file_path = file_path
        result.row_count = row_count
        result.byte_size = byte_size
        result.sha256 = sha256
        result.preview_json = preview or {}
        result.expires_at = expires_at
        result.ready_at = ready_at
        self.session.commit()
        self.session.refresh(result)
        return result

    def list_events(self, query_id: str) -> list[QueryExecutionEventORM]:
        return (
            self.session.query(QueryExecutionEventORM)
            .filter(QueryExecutionEventORM.query_id == query_id)
            .order_by(QueryExecutionEventORM.created_at.asc(), QueryExecutionEventORM.id.asc())
            .all()
        )

    def _append_event(
        self,
        *,
        query_id: str,
        event_type: str,
        from_status: str | None,
        to_status: str | None,
        payload: dict[str, Any] | None = None,
    ) -> QueryExecutionEventORM:
        event = QueryExecutionEventORM(
            query_id=query_id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            payload_json=payload or {},
        )
        self.session.add(event)
        return event
