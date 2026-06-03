from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import outerjoin, select
from sqlalchemy.orm import Session

from app.application.platform_facts.read_model import PlatformFactsReadModel
from app.domain.entities.data_source import DataSource
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

        fact_read_model = PlatformFactsReadModel(self.session)
        datasource_scale = fact_read_model.datasource_scale(
            current_month_start=month_start,
            previous_month_start=previous_month_start,
        )
        dataset_scale = fact_read_model.dataset_scale_for_dashboard(
            current_week_start=current_week_start,
            previous_week_start=previous_week_start,
        )
        semantic_model_total = self._get_semantic_model_total()
        query_scale = fact_read_model.interactive_query_scale(
            user_id=user_id,
            today_start=today_start,
            query_window_start=query_window_start,
        )

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
        if datasource_scale.total > 0:
            datasource_connectivity = round(datasource_scale.connected / datasource_scale.total * 100, 1)

        semantic_coverage = None
        if dataset_scale.total > 0 and semantic_model_total is not None and semantic_model_total > 0:
            semantic_coverage = round(min(semantic_model_total / dataset_scale.total, 1) * 100, 1)

        query_success_rate = None
        if query_scale.window_total > 0:
            query_success_rate = round(query_scale.window_success_total / query_scale.window_total * 100, 1)

        return {
            'stats': {
                'datasource_total': datasource_scale.total,
                'dataset_total': dataset_scale.total,
                'semantic_model_total': semantic_model_total,
                'today_query_count': query_scale.today,
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
                'datasource_month_delta': datasource_scale.current_month - datasource_scale.previous_month,
                'dataset_week_delta': dataset_scale.current_week - dataset_scale.previous_week,
                'query_count_week': query_scale.window_total,
            },
            'sources': {
                'datasource_total': datasource_scale.source,
                'connected_datasource_count': datasource_scale.source,
                'dataset_total': dataset_scale.source,
                'today_query_count': query_scale.source,
                'recent_queries': query_scale.source,
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
