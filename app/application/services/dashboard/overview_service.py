from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, outerjoin, select
from sqlalchemy.orm import Session

from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.domain.entities.query_history import QueryHistory
from app.application.semantic.semantic_definition_service import SemanticDefinitionService
from app.shared.utils.time import utcnow


class DashboardOverviewService:
    """聚合首页工作台所需的真实统计数据。"""

    def __init__(self, session: Session, semantic_definition_service: SemanticDefinitionService | None = None):
        self.session = session
        self.semantic_definition_service = semantic_definition_service

    def get_overview(self, user_id: str) -> dict[str, Any]:
        return self.handle(user_id=user_id)

    def handle(self, user_id: str) -> dict[str, Any]:
        now = utcnow()
        today_start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
        query_window_start = now - timedelta(days=7)
        current_week_start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo) - timedelta(days=now.weekday())
        current_week_start = current_week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        previous_week_start = current_week_start - timedelta(days=7)
        month_start = datetime(now.year, now.month, 1, tzinfo=now.tzinfo)
        previous_month_end = month_start - timedelta(microseconds=1)
        previous_month_start = datetime(previous_month_end.year, previous_month_end.month, 1, tzinfo=now.tzinfo)

        datasource_total = self.session.execute(
            select(func.count()).select_from(DataSource)
        ).scalar_one()
        connected_total = self.session.execute(
            select(func.count()).select_from(DataSource).where(
                DataSource.connection_status == 'connected'
            )
        ).scalar_one()
        current_month_total = self.session.execute(
            select(func.count()).select_from(DataSource).where(
                DataSource.created_at >= month_start
            )
        ).scalar_one()
        previous_month_total = self.session.execute(
            select(func.count()).select_from(DataSource).where(
                DataSource.created_at >= previous_month_start,
                DataSource.created_at < month_start,
            )
        ).scalar_one()

        dataset_total = self.session.execute(
            select(func.count()).select_from(Dataset).where(
                Dataset.is_deleted.is_(False)
            )
        ).scalar_one()
        semantic_model_total = self._get_semantic_model_total()
        current_week_dataset_total = self.session.execute(
            select(func.count()).select_from(Dataset).where(
                Dataset.is_deleted.is_(False),
                Dataset.created_at >= current_week_start,
            )
        ).scalar_one()
        previous_week_dataset_total = self.session.execute(
            select(func.count()).select_from(Dataset).where(
                Dataset.is_deleted.is_(False),
                Dataset.created_at >= previous_week_start,
                Dataset.created_at < current_week_start,
            )
        ).scalar_one()

        today_query_count = self.session.execute(
            select(func.count()).select_from(QueryHistory).where(
                QueryHistory.executed_by == user_id,
                QueryHistory.executed_at >= today_start,
            )
        ).scalar_one()

        query_count_week = self.session.execute(
            select(func.count()).select_from(QueryHistory).where(
                QueryHistory.executed_by == user_id,
                QueryHistory.executed_at >= query_window_start,
            )
        ).scalar_one()
        query_success_count = self.session.execute(
            select(func.count()).select_from(QueryHistory).where(
                QueryHistory.executed_by == user_id,
                QueryHistory.executed_at >= query_window_start,
                QueryHistory.status == 'success',
            )
        ).scalar_one()

        recent_query_rows = self.session.execute(
            select(
                QueryHistory.id,
                QueryHistory.sql_query,
                QueryHistory.status,
                QueryHistory.executed_at,
                DataSource.name.label('datasource_name'),
            )
            .select_from(
                outerjoin(QueryHistory, DataSource, QueryHistory.source_id == DataSource.id)
            )
            .where(QueryHistory.executed_by == user_id)
            .order_by(QueryHistory.executed_at.desc())
            .limit(5)
        ).all()

        datasource_connectivity = None
        if datasource_total > 0:
            datasource_connectivity = round(connected_total / datasource_total * 100, 1)

        semantic_coverage = None
        if dataset_total > 0 and semantic_model_total is not None and semantic_model_total > 0:
            semantic_coverage = round(min(semantic_model_total / dataset_total, 1) * 100, 1)

        query_success_rate = None
        if query_count_week > 0:
            query_success_rate = round(query_success_count / query_count_week * 100, 1)

        return {
            'stats': {
                'datasource_total': datasource_total,
                'dataset_total': dataset_total,
                'semantic_model_total': semantic_model_total,
                'today_query_count': today_query_count,
                'ai_chat_count': None,
            },
            'recent_queries': [
                {
                    'id': row.id,
                    'name': self._normalize_query_name(row.sql_query),
                    'datasource_name': row.datasource_name,
                    'executed_at': row.executed_at.isoformat() if row.executed_at else None,
                    'status': row.status,
                }
                for row in recent_query_rows
            ],
            'health': {
                'datasource_connectivity': datasource_connectivity,
                'semantic_coverage': semantic_coverage,
                'query_success_rate': query_success_rate,
            },
            'trends': {
                'datasource_month_delta': current_month_total - previous_month_total,
                'dataset_week_delta': current_week_dataset_total - previous_week_dataset_total,
                'query_count_week': query_count_week,
            },
        }

    def _get_semantic_model_total(self) -> int | None:
        if self.semantic_definition_service is None:
            return None
        try:
            return len(self.semantic_definition_service.list_cubes())
        except Exception:
            return None

    @staticmethod
    def _normalize_query_name(sql_query: str) -> str:
        first_line = (sql_query or '').splitlines()[0].strip()
        return first_line or '未命名查询'
