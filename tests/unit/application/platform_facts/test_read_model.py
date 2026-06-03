from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.application.platform_facts.read_model import PlatformFactsReadModel
from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.domain.entities.query_history import QueryHistory
from app.infrastructure.semantic.models import DataAssetTableORM


def _make_datasource(identifier: int, name: str, *, created_at, status: str):
    datasource = DataSource(
        name=name,
        source_type="postgresql",
        description="test",
        connection_config={"host": "localhost"},
        created_by="tester",
    )
    datasource.id = identifier
    datasource.created_at = created_at
    datasource.updated_at = created_at
    datasource.connection_status = status
    return datasource


def _make_dataset(identifier: int, name: str, *, created_at, is_deleted=False):
    dataset = Dataset(
        dataset_code=name.lower().replace(" ", "_"),
        dataset_name=name,
        dataset_type="physical",
        source_id=1,
        physical_table=name.lower().replace(" ", "_"),
        description="test",
        owner="tester",
        created_by="tester",
        schema_snapshot={},
    )
    dataset.id = identifier
    dataset.created_at = created_at
    dataset.updated_at = created_at
    dataset.is_deleted = is_deleted
    return dataset


def _make_data_asset_table(identifier: str, name: str, *, created_at, lifecycle_status="active"):
    return DataAssetTableORM(
        id=identifier,
        source_id="data-asset-smoke",
        database="df_cb_258187",
        schema="dw_smoke",
        name=name,
        title=name,
        table_type="table",
        lifecycle_status=lifecycle_status,
        field_count=2,
        sync_status="success",
        profile_status="ready",
        extra_json={},
        created_at=created_at,
        updated_at=created_at,
    )


def _make_history(identifier: int, index: int, *, executed_at, executed_by="tester", status="success"):
    history = QueryHistory(
        query_id=None,
        source_id=1,
        sql_query=f"SELECT {index}",
        status=status,
        result_rows=1,
        execution_time_ms=100 + index,
        executed_by=executed_by,
    )
    history.id = identifier
    history.executed_at = executed_at
    return history


def test_dataset_scale_for_dashboard_prefers_data_asset_tables(app, db_session):
    now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    previous_week_start = week_start - timedelta(days=7)

    db_session.add_all(
        [
            _make_dataset(10, "Legacy Current", created_at=week_start + timedelta(days=1)),
            _make_data_asset_table("asset_current", "dwd_current_df", created_at=week_start + timedelta(days=1)),
            _make_data_asset_table("asset_previous", "dwd_previous_df", created_at=previous_week_start + timedelta(days=1)),
            _make_data_asset_table(
                "asset_deleted",
                "dwd_deleted_df",
                created_at=week_start + timedelta(days=1),
                lifecycle_status="deleted",
            ),
        ]
    )
    db_session.commit()

    read_model = PlatformFactsReadModel(db_session)
    scale = read_model.dataset_scale_for_dashboard(
        current_week_start=week_start,
        previous_week_start=previous_week_start,
    )

    assert scale.source == "data_asset_tables"
    assert scale.total == 2
    assert scale.current_week == 1
    assert scale.previous_week == 1


def test_dataset_scale_for_dashboard_falls_back_to_platform_datasets(app, db_session):
    now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    previous_week_start = week_start - timedelta(days=7)

    db_session.add_all(
        [
            _make_dataset(10, "Dataset Current", created_at=week_start + timedelta(days=1)),
            _make_dataset(11, "Dataset Previous", created_at=previous_week_start + timedelta(days=1)),
            _make_dataset(12, "Dataset Deleted", created_at=week_start + timedelta(days=1), is_deleted=True),
        ]
    )
    db_session.commit()

    read_model = PlatformFactsReadModel(db_session)
    scale = read_model.dataset_scale_for_dashboard(
        current_week_start=week_start,
        previous_week_start=previous_week_start,
    )

    assert scale.source == "datasets"
    assert scale.total == 2
    assert scale.current_week == 1
    assert scale.previous_week == 1


def test_datasource_scale_counts_connected_and_legacy_success(app, db_session):
    now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    previous_month = month_start - timedelta(days=1)
    previous_month_start = previous_month.replace(day=1)

    db_session.add_all(
        [
            _make_datasource(1, "connected", created_at=month_start + timedelta(days=1), status="connected"),
            _make_datasource(2, "success", created_at=previous_month_start + timedelta(days=1), status="success"),
            _make_datasource(3, "unknown", created_at=previous_month_start + timedelta(days=2), status="unknown"),
        ]
    )
    db_session.commit()

    read_model = PlatformFactsReadModel(db_session)
    scale = read_model.datasource_scale(
        current_month_start=month_start,
        previous_month_start=previous_month_start,
    )

    assert scale.source == "data_sources"
    assert scale.total == 3
    assert scale.connected == 2
    assert scale.current_month == 1
    assert scale.previous_month == 2


def test_interactive_query_scale_reads_query_histories(app, db_session):
    now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = now - timedelta(days=7)

    db_session.add_all(
        [
            _make_history(101, 1, executed_at=today_start + timedelta(hours=1), status="success"),
            _make_history(102, 2, executed_at=now - timedelta(days=2), status="failed"),
            _make_history(103, 3, executed_at=now - timedelta(days=8), status="success"),
            _make_history(104, 4, executed_at=today_start + timedelta(hours=2), executed_by="other"),
        ]
    )
    db_session.commit()

    read_model = PlatformFactsReadModel(db_session)
    scale = read_model.interactive_query_scale(
        user_id="tester",
        today_start=today_start,
        query_window_start=window_start,
    )

    assert scale.source == "query_histories"
    assert scale.today == 1
    assert scale.window_total == 2
    assert scale.window_success_total == 1
