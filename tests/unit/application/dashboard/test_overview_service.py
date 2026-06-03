from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.domain.entities.query_history import QueryHistory
from app.infrastructure.semantic.models import DataAssetTableORM
from app.shared.enums import ConnectionStatus


def _make_datasource(identifier: int, name: str, *, created_at, status: str):
    ds = DataSource(
        name=name,
        source_type='postgresql',
        description='test',
        connection_config={'host': 'localhost'},
        created_by='tester',
    )
    ds.id = identifier
    ds.created_at = created_at
    ds.updated_at = created_at
    ds.connection_status = status
    return ds


def _make_dataset(identifier: int, name: str, *, created_at):
    dataset = Dataset(
        dataset_code=name.lower().replace(' ', '_'),
        dataset_name=name,
        dataset_type='physical',
        source_id=1,
        physical_table=name.lower().replace(' ', '_'),
        description='test',
        owner='tester',
        created_by='tester',
        schema_snapshot={},
    )
    dataset.id = identifier
    dataset.created_at = created_at
    dataset.updated_at = created_at
    return dataset


def _make_history(identifier: int, index: int, *, executed_at, executed_by='tester', status='success'):
    history = QueryHistory(
        query_id=None,
        source_id=1,
        sql_query=f'SELECT {index}',
        status=status,
        result_rows=1,
        execution_time_ms=100 + index,
        executed_by=executed_by,
    )
    history.id = identifier
    history.executed_at = executed_at
    return history


def _make_data_asset_table(identifier: str, name: str, *, created_at, lifecycle_status='active'):
    return DataAssetTableORM(
        id=identifier,
        source_id='data-asset-smoke',
        database='df_cb_258187',
        schema='dw_smoke',
        name=name,
        title=name,
        table_type='table',
        lifecycle_status=lifecycle_status,
        field_count=2,
        sync_status='success',
        profile_status='ready',
        extra_json={},
        created_at=created_at,
        updated_at=created_at,
    )


def test_dashboard_overview_service_aggregates_real_counts(app, db_session, monkeypatch):
    from app.application.services.dashboard.overview_service import DashboardOverviewService

    now = datetime(2026, 3, 27, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr('app.application.services.dashboard.overview_service.utcnow', lambda: now)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    previous_month = month_start - timedelta(days=1)
    previous_month_start = previous_month.replace(day=1)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    previous_week_start = week_start - timedelta(days=7)
    two_weeks_ago = previous_week_start - timedelta(days=1)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today_start - timedelta(days=1)

    ds_1 = _make_datasource(1, 'data_source_current_1', created_at=month_start + timedelta(days=1), status=ConnectionStatus.CONNECTED.value)
    ds_2 = _make_datasource(2, 'data_source_current_2', created_at=month_start + timedelta(days=2), status=ConnectionStatus.UNKNOWN.value)
    ds_3 = _make_datasource(3, 'data_source_previous', created_at=previous_month_start + timedelta(days=5), status=ConnectionStatus.CONNECTED.value)
    # 兼容历史运行库里遗留的 success 状态，避免首页把可用数据源误算为 0% 连通。
    ds_4 = _make_datasource(4, 'data_source_legacy_success', created_at=previous_month_start - timedelta(days=1), status='success')
    db_session.add_all([ds_1, ds_2, ds_3, ds_4])
    db_session.flush()

    dataset_1 = _make_dataset(10, 'Dataset Current 1', created_at=week_start + timedelta(days=1))
    dataset_2 = _make_dataset(11, 'Dataset Current 2', created_at=week_start + timedelta(days=2))
    dataset_3 = _make_dataset(12, 'Dataset Previous', created_at=previous_week_start + timedelta(days=1))
    db_session.add_all([dataset_1, dataset_2, dataset_3])
    db_session.flush()

    histories = [
        _make_history(101, 1, executed_at=today_start + timedelta(hours=1)),
        _make_history(102, 2, executed_at=today_start + timedelta(hours=2)),
        _make_history(103, 3, executed_at=yesterday, status='failed'),
        _make_history(104, 4, executed_at=now - timedelta(days=2)),
        _make_history(105, 5, executed_at=now - timedelta(days=3)),
        _make_history(106, 6, executed_at=now - timedelta(days=4)),
        _make_history(107, 7, executed_at=two_weeks_ago),
        _make_history(108, 8, executed_at=now - timedelta(days=6)),
    ]
    db_session.add_all(histories)
    db_session.commit()

    service = DashboardOverviewService(session=db_session)
    overview = service.get_overview(user_id='tester')

    assert overview['stats']['datasource_total'] == 4
    assert overview['stats']['dataset_total'] == 3
    assert overview['stats']['today_query_count'] == 2
    assert overview['stats']['ai_chat_count'] is None
    assert len(overview['recent_queries']) == 5
    assert overview['health']['datasource_connectivity'] == 75.0
    assert overview['health']['semantic_coverage'] is None
    assert overview['health']['query_success_rate'] == 85.7
    assert overview['trends']['datasource_month_delta'] == 1
    assert overview['trends']['dataset_week_delta'] == 1
    assert overview['trends']['query_count_week'] == 7
    assert overview['sources']['datasource_total'] == 'data_sources'
    assert overview['sources']['connected_datasource_count'] == 'data_sources'
    assert overview['sources']['dataset_total'] == 'datasets'
    assert overview['sources']['today_query_count'] == 'query_histories'
    assert overview['sources']['recent_queries'] == 'query_histories'


def test_dashboard_overview_service_prefers_data_asset_tables_when_legacy_datasets_empty(app, db_session, monkeypatch):
    from app.application.services.dashboard.overview_service import DashboardOverviewService

    now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr('app.application.services.dashboard.overview_service.utcnow', lambda: now)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    previous_week_start = week_start - timedelta(days=7)

    db_session.add_all([
        _make_data_asset_table('tbl_current', 'dwd_current_df', created_at=week_start + timedelta(days=1)),
        _make_data_asset_table('tbl_previous', 'dwd_previous_df', created_at=previous_week_start + timedelta(days=1)),
        _make_data_asset_table('tbl_deleted', 'dwd_deleted_df', created_at=week_start + timedelta(days=1), lifecycle_status='deleted'),
    ])
    db_session.commit()

    service = DashboardOverviewService(session=db_session)
    overview = service.get_overview(user_id='tester')

    assert overview['stats']['dataset_total'] == 2
    assert overview['trends']['dataset_week_delta'] == 0
    assert overview['sources']['dataset_total'] == 'data_asset_tables'
