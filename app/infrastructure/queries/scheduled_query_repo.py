# app/infrastructure/queries/scheduled_query_repo.py
"""ScheduledQuery 仓储（基础设施层）"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from app.domain.queries.scheduled_query import ScheduledQuery
from app.domain.queries.scheduled_query_run import ScheduledQueryRun
from app.extensions import db


class ScheduledQueryRepo:
    """ScheduledQuery + ScheduledQueryRun 的 SQLAlchemy 仓储。"""

    # ── ScheduledQuery CRUD ──────────────────────────────────────────────────

    def list(self, page: int, page_size: int, owner_id: Optional[str] = None) -> dict:
        q = db.session.query(ScheduledQuery)
        if owner_id is not None:
            q = q.filter(ScheduledQuery.owner_id == owner_id)
        total = q.count()
        items = (
            q.order_by(ScheduledQuery.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [sq.to_dict() for sq in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get(self, query_id: int) -> Optional[ScheduledQuery]:
        return db.session.get(ScheduledQuery, query_id)

    def create(self, data: dict) -> ScheduledQuery:
        sq = ScheduledQuery(**data)
        db.session.add(sq)
        db.session.commit()
        return sq

    def update(self, query_id: int, data: dict) -> Optional[ScheduledQuery]:
        sq = db.session.get(ScheduledQuery, query_id)
        if sq is None:
            return None
        for k, v in data.items():
            setattr(sq, k, v)
        sq.updated_at = datetime.utcnow()
        db.session.commit()
        return sq

    def delete(self, query_id: int) -> bool:
        sq = db.session.get(ScheduledQuery, query_id)
        if sq is None:
            return False
        db.session.delete(sq)
        db.session.commit()
        return True

    def list_enabled(self) -> list[ScheduledQuery]:
        return (
            db.session.query(ScheduledQuery)
            .filter(ScheduledQuery.enabled.is_(True))
            .all()
        )

    # ── ScheduledQueryRun ────────────────────────────────────────────────────

    def list_runs(self, query_id: int, page: int, page_size: int) -> dict:
        q = db.session.query(ScheduledQueryRun).filter(
            ScheduledQueryRun.query_id == query_id
        )
        total = q.count()
        items = (
            q.order_by(ScheduledQueryRun.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [r.to_dict() for r in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def create_run(self, query_id: int, status: str = "running") -> ScheduledQueryRun:
        run = ScheduledQueryRun(
            query_id=query_id,
            status=status,
            started_at=datetime.utcnow(),
        )
        db.session.add(run)
        db.session.commit()
        return run

    def finish_run(
        self,
        run_id: int,
        status: str,
        rows_returned: Optional[int] = None,
        error: Optional[str] = None,
    ) -> Optional[ScheduledQueryRun]:
        run = db.session.get(ScheduledQueryRun, run_id)
        if run is None:
            return None
        run.status = status
        run.finished_at = datetime.utcnow()
        run.rows_returned = rows_returned
        run.error = error
        db.session.commit()
        return run

    def update_query_last_run(
        self,
        query_id: int,
        last_run_at: datetime,
        last_status: str,
    ) -> None:
        sq = db.session.get(ScheduledQuery, query_id)
        if sq is None:
            return
        sq.last_run_at = last_run_at
        sq.last_status = last_status
        sq.updated_at = datetime.utcnow()
        db.session.commit()
