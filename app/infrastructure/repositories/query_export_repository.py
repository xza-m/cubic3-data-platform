"""
QueryExport 仓储实现
"""
import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.domain.entities.query_export import QueryExport
from app.domain.ports.repositories.query_export_repository_port import (
    IQueryExportRepository,
)
from app.shared.enums import QueryExportStatus


_ACTIVE_STATUSES = (
    QueryExportStatus.PENDING.value,
    QueryExportStatus.RUNNING.value,
    QueryExportStatus.CANCELLING.value,
)


class QueryExportRepository(IQueryExportRepository):
    """SQLAlchemy QueryExport 仓储"""

    def __init__(self, session: Session):
        self.session = session

    # ------------------------------------------------------------------
    # 基础 CRUD
    # ------------------------------------------------------------------

    def save(self, export: QueryExport) -> QueryExport:
        self.session.add(export)
        self.session.commit()
        self.session.refresh(export)
        return export

    def find_by_id(self, export_id: int) -> Optional[QueryExport]:
        return self.session.query(QueryExport).filter_by(id=export_id).first()

    def find_for_user(self, export_id: int, user_id: str) -> Optional[QueryExport]:
        return (
            self.session.query(QueryExport)
            .filter_by(id=export_id, user_id=user_id)
            .first()
        )

    def list_by_user(
        self,
        user_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
    ) -> dict:
        page = max(1, int(page or 1))
        page_size = max(1, min(100, int(page_size or 20)))

        base_query = self.session.query(QueryExport).filter_by(user_id=user_id)
        if status:
            base_query = base_query.filter(QueryExport.status == status)

        total = base_query.count()
        items = (
            base_query.order_by(QueryExport.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        total_pages = math.ceil(total / page_size) if page_size else 1
        return {
            'items': [item.to_dict() for item in items],
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }

    def list_expiring(self, cutoff: datetime, *, limit: int = 100) -> List[QueryExport]:
        return (
            self.session.query(QueryExport)
            .filter(
                QueryExport.status == QueryExportStatus.SUCCESS.value,
                QueryExport.expires_at.isnot(None),
                QueryExport.expires_at <= cutoff,
            )
            .order_by(QueryExport.expires_at.asc())
            .limit(limit)
            .all()
        )

    def count_today_by_user(self, user_id: str) -> int:
        today_utc = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=None
        )
        return (
            self.session.query(QueryExport)
            .filter(
                QueryExport.user_id == user_id,
                QueryExport.created_at >= today_utc,
            )
            .count()
        )

    def count_active_by_user(self, user_id: str) -> int:
        return (
            self.session.query(QueryExport)
            .filter(
                QueryExport.user_id == user_id,
                QueryExport.status.in_(_ACTIVE_STATUSES),
            )
            .count()
        )

    def commit(self) -> None:
        self.session.commit()
