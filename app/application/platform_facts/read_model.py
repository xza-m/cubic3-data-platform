from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.platform_facts.source_status import CONNECTED_DATASOURCE_STATUSES
from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.domain.entities.query_history import QueryHistory
from app.infrastructure.semantic.models import DataAssetTableORM


DatasourceScaleSource = Literal["data_sources"]
DatasetScaleSource = Literal["data_asset_tables", "datasets"]
QueryScaleSource = Literal["query_histories"]


@dataclass(frozen=True)
class DatasourceScale:
    total: int
    connected: int
    current_month: int
    previous_month: int
    source: DatasourceScaleSource = "data_sources"


@dataclass(frozen=True)
class DatasetScale:
    total: int
    current_week: int
    previous_week: int
    source: DatasetScaleSource


@dataclass(frozen=True)
class InteractiveQueryScale:
    today: int
    window_total: int
    window_success_total: int
    source: QueryScaleSource = "query_histories"


class PlatformFactsReadModel:
    """封装平台控制面事实源聚合，避免 Dashboard 直接混读多类实体。"""

    def __init__(self, session: Session):
        self.session = session

    def datasource_scale(
        self,
        *,
        current_month_start: datetime,
        previous_month_start: datetime,
    ) -> DatasourceScale:
        total = self._count(select(func.count()).select_from(DataSource))
        connected = self._count(
            select(func.count()).select_from(DataSource).where(
                DataSource.connection_status.in_(CONNECTED_DATASOURCE_STATUSES)
            )
        )
        current_month = self._count(
            select(func.count()).select_from(DataSource).where(
                DataSource.created_at >= current_month_start
            )
        )
        previous_month = self._count(
            select(func.count()).select_from(DataSource).where(
                DataSource.created_at >= previous_month_start,
                DataSource.created_at < current_month_start,
            )
        )
        return DatasourceScale(
            total=total,
            connected=connected,
            current_month=current_month,
            previous_month=previous_month,
        )

    def datasource_total(self) -> int:
        return self._count(select(func.count()).select_from(DataSource))

    def datasource_connected_total(self) -> int:
        return self._count(
            select(func.count()).select_from(DataSource).where(
                DataSource.connection_status.in_(CONNECTED_DATASOURCE_STATUSES)
            )
        )

    def data_asset_scale(
        self,
        *,
        current_week_start: datetime,
        previous_week_start: datetime,
    ) -> DatasetScale:
        total = self._count(self._active_data_asset_count_stmt())
        current_week = self._count(
            self._active_data_asset_count_stmt().where(
                DataAssetTableORM.created_at >= current_week_start
            )
        )
        previous_week = self._count(
            self._active_data_asset_count_stmt().where(
                DataAssetTableORM.created_at >= previous_week_start,
                DataAssetTableORM.created_at < current_week_start,
            )
        )
        return DatasetScale(
            total=total,
            current_week=current_week,
            previous_week=previous_week,
            source="data_asset_tables",
        )

    def platform_dataset_scale(
        self,
        *,
        current_week_start: datetime,
        previous_week_start: datetime,
    ) -> DatasetScale:
        total = self._count(self._active_platform_dataset_count_stmt())
        current_week = self._count(
            self._active_platform_dataset_count_stmt().where(
                Dataset.created_at >= current_week_start
            )
        )
        previous_week = self._count(
            self._active_platform_dataset_count_stmt().where(
                Dataset.created_at >= previous_week_start,
                Dataset.created_at < current_week_start,
            )
        )
        return DatasetScale(
            total=total,
            current_week=current_week,
            previous_week=previous_week,
            source="datasets",
        )

    def dataset_scale_for_dashboard(
        self,
        *,
        current_week_start: datetime,
        previous_week_start: datetime,
    ) -> DatasetScale:
        data_asset_scale = self.data_asset_scale(
            current_week_start=current_week_start,
            previous_week_start=previous_week_start,
        )
        if data_asset_scale.total > 0:
            return data_asset_scale
        return self.platform_dataset_scale(
            current_week_start=current_week_start,
            previous_week_start=previous_week_start,
        )

    def interactive_query_scale(
        self,
        *,
        user_id: str,
        today_start: datetime,
        query_window_start: datetime,
    ) -> InteractiveQueryScale:
        today = self._count(
            select(func.count()).select_from(QueryHistory).where(
                QueryHistory.executed_by == user_id,
                QueryHistory.executed_at >= today_start,
            )
        )
        window_total = self._count(
            select(func.count()).select_from(QueryHistory).where(
                QueryHistory.executed_by == user_id,
                QueryHistory.executed_at >= query_window_start,
            )
        )
        window_success_total = self._count(
            select(func.count()).select_from(QueryHistory).where(
                QueryHistory.executed_by == user_id,
                QueryHistory.executed_at >= query_window_start,
                QueryHistory.status == "success",
            )
        )
        return InteractiveQueryScale(
            today=today,
            window_total=window_total,
            window_success_total=window_success_total,
        )

    def _active_data_asset_count_stmt(self):
        return select(func.count()).select_from(DataAssetTableORM).where(
            DataAssetTableORM.lifecycle_status != "deleted"
        )

    def _active_platform_dataset_count_stmt(self):
        return select(func.count()).select_from(Dataset).where(
            Dataset.is_deleted.is_(False)
        )

    def _count(self, statement) -> int:
        return int(self.session.execute(statement).scalar_one() or 0)
