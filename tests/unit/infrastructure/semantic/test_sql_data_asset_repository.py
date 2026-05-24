from sqlalchemy import Text

from app.domain.semantic.data_asset import (
    AssetField,
    AssetLineage,
    AssetSnapshot,
    AssetSyncRun,
    AssetTable,
    AssetUsage,
)
from app.infrastructure.semantic.models import DataAssetFieldORM
from app.infrastructure.semantic.sql_data_asset_repository import SqlDataAssetRepository


def test_data_asset_field_type_column_supports_complex_types():
    assert isinstance(DataAssetFieldORM.__table__.c.data_type.type, Text)


def test_sql_data_asset_repository_upserts_table_fields_and_latest_snapshot(db_session):
    repo = SqlDataAssetRepository(db_session)
    table = repo.upsert_table(
        AssetTable(
            id="tbl_comment",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="dw",
            name="dwd_comment_df",
            title="评论事实表",
            layer="dwd",
            row_count=100,
        )
    )
    repo.replace_fields(
        table.id,
        [
            AssetField(
                id="fld_comment_school",
                table_id=table.id,
                source_id=table.source_id,
                database=table.database,
                schema=table.source_schema,
                table_name=table.name,
                name="school_id",
                data_type="bigint",
                nullable=False,
            ),
            AssetField(
                id="fld_comment_content",
                table_id=table.id,
                source_id=table.source_id,
                database=table.database,
                schema=table.source_schema,
                table_name=table.name,
                name="comment_content",
                data_type="string",
                profile={"null_rate": 0.12},
            ),
        ],
    )
    repo.save_snapshot(
        AssetSnapshot(
            id="snap_comment_schema",
            table_id=table.id,
            snapshot_type="schema",
            payload={
                "columns": [
                    {"name": "school_id", "type": "BIGINT"},
                    {"name": "comment_content", "type": "STRING"},
                ]
            },
            sync_run_id="sync_1",
        )
    )

    loaded = repo.get_table(table.id)
    fields = repo.list_fields(table.id)
    snapshot = repo.latest_snapshot(table.id, snapshot_type="schema")

    assert loaded is not None
    assert loaded.asset_key == "maxcompute-prod.df_cb_258187.dw.dwd_comment_df"
    assert [field.name for field in fields] == ["school_id", "comment_content"]
    assert fields[0].data_type == "BIGINT"
    assert snapshot is not None
    assert snapshot.payload["columns"][1]["name"] == "comment_content"


def test_sql_data_asset_repository_lists_tables_with_search_and_pagination(db_session):
    repo = SqlDataAssetRepository(db_session)
    repo.upsert_table(
        AssetTable(
            id="tbl_comment",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="dw",
            name="dwd_comment_df",
            title="评论事实表",
            layer="dwd",
        )
    )
    repo.upsert_table(
        AssetTable(
            id="tbl_order",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="dm",
            name="ads_order_df",
            title="订单汇总表",
            layer="ads",
        )
    )

    page = repo.list_tables(keyword="comment", page=1, page_size=10)

    assert page["total"] == 1
    assert page["items"][0].id == "tbl_comment"
    assert page["page_count"] == 1


def test_sql_data_asset_repository_filters_tables_by_source_schema_and_status(db_session):
    repo = SqlDataAssetRepository(db_session)
    repo.upsert_table(
        AssetTable(
            id="tbl_order",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="dw",
            name="dwd_order_df",
            title="订单事实表",
            sync_status="success",
            lifecycle_status="active",
        )
    )
    repo.upsert_table(
        AssetTable(
            id="tbl_comment",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="ods",
            name="ods_comment_log",
            title="评论日志",
            sync_status="drift_risk",
            lifecycle_status="active",
        )
    )
    repo.upsert_table(
        AssetTable(
            id="tbl_archive",
            source_id="warehouse_pg",
            database="shop",
            schema="public",
            name="dwd_order_archive",
            title="历史订单",
            sync_status="success",
            lifecycle_status="deprecated",
        )
    )

    result = repo.list_tables(
        keyword="order",
        page=1,
        page_size=20,
        source_id="maxcompute-prod",
        database="df_cb_258187",
        schema="dw",
        sync_status="success",
        lifecycle_status="active",
    )

    assert result["total"] == 1
    assert result["items"][0].id == "tbl_order"


def test_sql_data_asset_repository_preserves_complex_field_type(db_session):
    repo = SqlDataAssetRepository(db_session)
    table = repo.upsert_table(
        AssetTable(
            id="tbl_complex",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="ods",
            name="ods_complex_df",
        )
    )
    complex_type = (
        "ARRAY<STRUCT<`STUDY_TYPE`:STRING,`BEGIN_TIME`:STRING,`END_TIME`:STRING,"
        "`ANSWER`:STRUCT<`VALUE`:STRING,`SCORE`:DOUBLE,`COMMENTS`:ARRAY<STRING>>>>"
    )

    repo.replace_fields(
        table.id,
        [
            AssetField(
                id="fld_complex_payload",
                table_id=table.id,
                source_id=table.source_id,
                database=table.database,
                schema=table.source_schema,
                table_name=table.name,
                name="payload",
                data_type=complex_type,
            )
        ],
    )

    fields = repo.list_fields(table.id)

    assert fields[0].data_type == complex_type


def test_sql_data_asset_repository_tracks_sync_usage_lineage_and_radar(db_session):
    repo = SqlDataAssetRepository(db_session)
    sync = repo.start_sync_run(AssetSyncRun(id="sync_1", source_id="maxcompute-prod"))
    table = repo.upsert_table(
        AssetTable(
            id="tbl_comment",
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="dw",
            name="dwd_comment_df",
            title="评论事实表",
            layer="dwd",
            profile_status="stale",
        )
    )
    repo.replace_fields(
        table.id,
        [
            AssetField(
                id="fld_comment_school",
                table_id=table.id,
                source_id=table.source_id,
                database=table.database,
                schema=table.source_schema,
                table_name=table.name,
                name="school_id",
                data_type="BIGINT",
            )
        ],
    )
    repo.finish_sync_run(sync.id, status="failed", error_message="MaxCompute timeout", stats={"table_count": 1})
    repo.record_usage(
        AssetUsage(
            id="usage_1",
            table_id=table.id,
            field_id=None,
            source_type="sql_history",
            source_ref="query_1",
            usage_count=5,
        )
    )
    repo.record_lineage(
        AssetLineage(
            id="lin_1",
            source_table_id=table.id,
            target_type="cube",
            target_ref="student_comment_cube",
            relation_type="downstream",
        )
    )

    assert repo.list_sync_runs()[0].status == "failed"
    assert repo.list_usage(table.id)[0].usage_count == 5
    assert repo.list_lineage(table.id)[0].target_ref == "student_comment_cube"
    assert repo.radar_summary() == {
        "table_count": 1,
        "field_count": 1,
        "failed_sync_count": 1,
        "stale_profile_count": 1,
        "drift_risk_count": 0,
        "last_sync_at": None,
    }


def test_sql_data_asset_repository_radar_counts_latest_sync_failure_per_source(db_session):
    repo = SqlDataAssetRepository(db_session)
    failed = repo.start_sync_run(
        AssetSyncRun(
            id="sync_failed",
            source_id="maxcompute-prod",
            started_at="2026-05-22T00:00:00Z",
        )
    )
    repo.finish_sync_run(failed.id, status="failed")
    succeeded = repo.start_sync_run(
        AssetSyncRun(
            id="sync_success",
            source_id="maxcompute-prod",
            started_at="2026-05-23T00:00:00Z",
        )
    )
    repo.finish_sync_run(succeeded.id, status="success")

    assert repo.radar_summary()["failed_sync_count"] == 0


def test_sql_data_asset_repository_handles_missing_sync_and_invalid_timestamps(db_session):
    repo = SqlDataAssetRepository(db_session)
    table = repo.upsert_table(
        AssetTable(
            id="tbl_bad_time",
            source_id="maxcompute-prod",
            database="dw",
            name="dwd_bad_time",
            last_synced_at="not-a-date",
        )
    )

    assert repo.finish_sync_run("missing", status="success") is None
    assert table.last_synced_at is None
