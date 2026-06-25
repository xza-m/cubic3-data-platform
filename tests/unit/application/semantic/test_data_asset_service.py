from types import SimpleNamespace

from app.application.semantic.data_asset_service import DataAssetService
from app.infrastructure.semantic.sql_data_asset_repository import SqlDataAssetRepository


def _metadata_payload():
    return {
        "source_id": "maxcompute-prod",
        "database": "df_cb_258187",
        "schema": "dw",
        "tables": [
            {
                "name": "dwd_comment_df",
                "title": "评论事实表",
                "description": "学生互动评论事实明细",
                "layer": "dwd",
                "owner": "dw_team",
                "row_count": 128,
                "partition_count": 3,
                "profile_status": "fresh",
                "fields": [
                    {
                        "name": "school_id",
                        "type": "bigint",
                        "nullable": False,
                        "comment": "学校 ID",
                        "profile": {"null_rate": 0, "cardinality": 12},
                    },
                    {
                        "name": "comment_content",
                        "type": "string",
                        "nullable": True,
                        "comment": "评论内容",
                        "profile": {"null_rate": 0.07, "cardinality": 96},
                    },
                ],
                "usage": [
                    {
                        "source_type": "sql_history",
                        "source_ref": "query_comment_hotspot",
                        "usage_count": 8,
                    }
                ],
                "lineage": [
                    {
                        "direction": "downstream",
                        "target_type": "cube",
                        "target_ref": "student_comment_cube",
                        "relation_type": "derived_metric_source",
                    }
                ],
            }
        ],
    }


def test_data_asset_service_syncs_payload_and_builds_evidence(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))

    sync_run = service.sync_from_payload(_metadata_payload())
    radar = service.radar_summary()
    tables = service.list_tables(keyword="comment", page=1, page_size=10)
    table = tables["items"][0]
    fields = service.list_fields(table["id"])
    evidence = service.build_table_evidence(table["id"])

    assert sync_run["status"] == "success"
    assert sync_run["stats"] == {
        "table_count": 1,
        "field_count": 2,
        "snapshot_count": 1,
        "usage_count": 1,
        "lineage_count": 1,
    }
    assert radar["table_count"] == 1
    assert radar["field_count"] == 2
    assert radar["failed_sync_count"] == 0
    assert table["qualified_name"] == "df_cb_258187.dw.dwd_comment_df"
    assert [field["name"] for field in fields["items"]] == [
        "school_id",
        "comment_content",
    ]
    assert evidence["runtime_truth"] is False
    assert evidence["asset_refs"][0]["qualified_name"] == "df_cb_258187.dw.dwd_comment_df"
    assert evidence["schema_snapshot"]["columns"][0]["name"] == "school_id"
    assert evidence["sample_profile"]["row_count"] == 128
    assert evidence["usage_evidence"][0]["source_ref"] == "query_comment_hotspot"
    assert evidence["lineage_evidence"][0]["target_ref"] == "student_comment_cube"


def test_data_asset_service_schema_snapshot_carries_partition_markers(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))

    sync_run = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "schema": "dw",
            "tables": [
                {
                    "name": "dws_study_student_answer_kb_stat_di",
                    "title": "学生答题知识点统计",
                    "layer": "dws",
                    "fields": [
                        {
                            "name": "school_id",
                            "type": "bigint",
                            "nullable": False,
                            "comment": "学校 ID",
                            "profile": {"null_rate": 0, "cardinality": 12},
                        },
                        {
                            "name": "ds",
                            "type": "string",
                            "nullable": False,
                            "comment": "分区日期",
                            "profile": {"is_partition": True},
                        },
                    ],
                }
            ],
        }
    )
    tables = service.list_tables(keyword="answer_kb_stat", page=1, page_size=10)
    table_id = tables["items"][0]["id"]
    evidence = service.build_table_evidence(table_id)

    schema_snapshot = evidence["schema_snapshot"]
    columns_by_name = {column["name"]: column for column in schema_snapshot["columns"]}

    assert sync_run["status"] == "success"
    assert schema_snapshot["partitions"] == ["ds"]
    assert columns_by_name["ds"]["is_partition"] is True
    assert columns_by_name["school_id"]["is_partition"] is False
    # 既有列字段不回归
    assert columns_by_name["school_id"]["type"] == "bigint"
    assert columns_by_name["ds"]["comment"] == "分区日期"


def test_data_asset_service_rebinds_fields_when_natural_key_keeps_existing_table_id(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))

    first_sync = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "schema": "dw",
            "tables": [
                {
                    "id": "tbl_order_old",
                    "name": "dwd_order_df",
                    "fields": [{"name": "old_amount", "type": "bigint"}],
                }
            ],
        }
    )
    second_sync = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "schema": "dw",
            "tables": [
                {
                    "id": "tbl_order_new",
                    "name": "dwd_order_df",
                    "fields": [
                        {"name": "order_id", "type": "bigint"},
                        {"name": "pay_amount", "type": "decimal"},
                    ],
                }
            ],
        }
    )

    table = service.get_table("tbl_order_old")
    fields = service.list_fields("tbl_order_old")
    evidence = service.build_table_evidence("tbl_order_old")

    assert first_sync["status"] == "success"
    assert second_sync["status"] == "success"
    assert table["field_count"] == 2
    assert fields["total"] == 2
    assert {field["table_id"] for field in fields["items"]} == {"tbl_order_old"}
    assert [field["name"] for field in fields["items"]] == ["order_id", "pay_amount"]
    assert evidence["schema_snapshot"]["table_id"] == "tbl_order_old"
    assert [column["name"] for column in evidence["schema_snapshot"]["columns"]] == [
        "order_id",
        "pay_amount",
    ]


def test_data_asset_service_syncs_registered_datasource_schema(db_session):
    class FakeDatasourceRepository:
        def find_all(self):
            return [
                SimpleNamespace(
                    id=5,
                    name="warehouse_pg",
                    source_type="postgresql",
                    connection_config={"database": "shop_db"},
                    extra_config={"catalog_sync": {"tracked_databases": ["shop_db"]}},
                    is_active=True,
                    can_use=lambda: True,
                )
            ]

    class FakeAdapter:
        def list_databases(self):
            return ["shop_db"]

        def list_tables(self, database):
            assert database == "shop_db"
            return [
                {
                    "table_name": "public.dwd_order_fact",
                    "comment": "订单事实表",
                    "row_count": 12,
                }
            ]

        def get_table_schema(self, database, table):
            assert database == "shop_db"
            assert table == "public.dwd_order_fact"
            return {
                "comment": "订单事实表",
                "columns": [
                    {"name": "order_id", "type": "bigint", "is_nullable": False, "comment": "订单 ID"},
                    {"name": "amount", "type": "decimal", "is_nullable": True, "comment": "金额"},
                ],
                "row_count": 12,
                "partitions": [],
            }

        def close(self):
            pass

    class FakeAdapterFactory:
        @staticmethod
        def create_adapter(source_type, connection_config):
            assert source_type == "postgresql"
            assert connection_config == {"database": "shop_db"}
            return FakeAdapter()

    service = DataAssetService(
        SqlDataAssetRepository(db_session),
        datasource_repository=FakeDatasourceRepository(),
        adapter_factory=FakeAdapterFactory,
    )

    sync_run = service.sync_from_payload({"datasource_id": 5})
    tables = service.list_tables(keyword="order", page=1, page_size=10, source_id="5")
    table = tables["items"][0]
    fields = service.list_fields(table["id"])

    assert sync_run["status"] == "success"
    assert sync_run["source_id"] == "5"
    assert sync_run["stats"]["datasource_count"] == 1
    assert sync_run["stats"]["database_count"] == 1
    assert sync_run["stats"]["table_count"] == 1
    assert sync_run["stats"]["field_count"] == 2
    assert table["source_id"] == "5"
    assert table["database"] == "shop_db"
    assert table["schema"] == "public"
    assert table["name"] == "dwd_order_fact"
    assert table["layer"] == "dwd"
    assert table["extra"]["datasource_name"] == "warehouse_pg"
    assert [field["name"] for field in fields["items"]] == ["order_id", "amount"]


def test_data_asset_service_canonicalizes_named_datasource_sync_to_id(db_session):
    class FakeDatasourceRepository:
        def find_all(self):
            return [
                SimpleNamespace(
                    id=5,
                    name="warehouse_pg",
                    source_type="postgresql",
                    connection_config={"database": "shop_db"},
                    extra_config={"catalog_sync": {"tracked_databases": ["shop_db"]}},
                    is_active=True,
                    can_use=lambda: True,
                )
            ]

    class FakeAdapter:
        def list_databases(self):
            return ["shop_db"]

        def list_tables(self, database):
            assert database == "shop_db"
            return [{"table_name": "public.dwd_order_fact", "comment": "订单事实表"}]

        def get_table_schema(self, database, table):
            assert database == "shop_db"
            assert table == "public.dwd_order_fact"
            return {
                "columns": [
                    {"name": "order_id", "type": "bigint", "is_nullable": False},
                ],
                "partitions": [],
            }

        def close(self):
            pass

    class FakeAdapterFactory:
        @staticmethod
        def create_adapter(source_type, connection_config):
            assert source_type == "postgresql"
            assert connection_config == {"database": "shop_db"}
            return FakeAdapter()

    service = DataAssetService(
        SqlDataAssetRepository(db_session),
        datasource_repository=FakeDatasourceRepository(),
        adapter_factory=FakeAdapterFactory,
    )

    sync_run = service.sync_from_payload({"source_id": "warehouse_pg"})
    canonical_tables = service.list_tables(keyword="order", page=1, page_size=10, source_id="5")
    named_tables = service.list_tables(keyword="order", page=1, page_size=10, source_id="warehouse_pg")

    assert sync_run["status"] == "success"
    assert sync_run["source_id"] == "5"
    assert canonical_tables["total"] == 1
    assert canonical_tables["items"][0]["source_id"] == "5"
    assert named_tables["total"] == 0


def test_data_asset_service_filters_tables_and_returns_sync_run_detail(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))
    sync_run = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "schema": "dw",
            "tables": [
                {
                    "id": "tbl_order",
                    "name": "dwd_order_df",
                    "title": "订单事实表",
                    "sync_status": "success",
                    "lifecycle_status": "active",
                },
                {
                    "id": "tbl_comment",
                    "schema": "ods",
                    "name": "ods_comment_log",
                    "title": "评论日志",
                    "sync_status": "drift_risk",
                    "lifecycle_status": "active",
                },
            ],
        }
    )

    tables = service.list_tables(
        keyword="order",
        page=1,
        page_size=20,
        source_id="maxcompute-prod",
        database="df_cb_258187",
        schema="dw",
        sync_status="success",
        lifecycle_status="active",
    )
    sync_run_detail = service.get_sync_run(sync_run["id"])

    assert tables["total"] == 1
    assert tables["items"][0]["id"] == "tbl_order"
    assert sync_run_detail is not None
    assert sync_run_detail["id"] == sync_run["id"]
    assert sync_run_detail["status"] == "success"


def test_data_asset_service_masks_credentials_in_registered_sync_errors(db_session):
    class FakeDatasourceRepository:
        def find_all(self):
            return [
                SimpleNamespace(
                    id=5,
                    name="warehouse_pg",
                    source_type="maxcompute",
                    connection_config={"database": "shop_db"},
                    extra_config={},
                    is_active=True,
                    can_use=lambda: True,
                )
            ]

    class FakeAdapterFactory:
        @staticmethod
        def create_adapter(source_type, connection_config):
            raise RuntimeError(
                "Invalid credentials. accessKeyId: LTAI5tExampleKey: "
                "LTAI5tExampleKey access_key_id=plain-ak-id "
                "accessId: another-ak-id access_key=plain-secret "
                "accessKeySecret=plain-secret-2 access_key_secret=example-secret-value "
                "{\"accessKeySecret\": \"json-secret\"} "
                "{'access_key_id': 'py-ak-id'} "
                '"access_key": "quoted-secret" secret_access_key: colon-secret'
            )

    service = DataAssetService(
        SqlDataAssetRepository(db_session),
        datasource_repository=FakeDatasourceRepository(),
        adapter_factory=FakeAdapterFactory,
    )

    sync_run = service.sync_from_payload({"source_id": "warehouse_pg"})
    message = sync_run["stats"]["source_errors"][0]["message"]

    assert sync_run["status"] == "failed"
    assert "LTAI5tExampleKey" not in message
    assert "plain-ak-id" not in message
    assert "another-ak-id" not in message
    assert "plain-secret" not in message
    assert "plain-secret-2" not in message
    assert "example-secret-value" not in message
    assert "json-secret" not in message
    assert "py-ak-id" not in message
    assert "quoted-secret" not in message
    assert "colon-secret" not in message
    assert "LTAI******" in message


def test_data_asset_service_masks_credentials_in_payload_sync_errors(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))

    sync_run = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "tables": [
                {
                    "name": "dwd_payload",
                    "fields": [{"name": "access_key_secret=plain-secret", "type": ""}],
                }
            ],
        }
    )

    assert sync_run["status"] == "failed"
    assert "plain-secret" not in sync_run["error_message"]
    assert "access_key_secret=******" in sync_run["error_message"]


def test_data_asset_service_reports_failed_sync_for_invalid_payload(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))

    sync_run = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "tables": [{"title": "缺少表名"}],
        }
    )

    assert sync_run["status"] == "failed"
    assert "table name is required" in sync_run["error_message"]
    assert service.radar_summary()["failed_sync_count"] == 1


def test_data_asset_service_covers_empty_optional_and_invalid_nested_payloads(db_session):
    service = DataAssetService(SqlDataAssetRepository(db_session))

    missing_database = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "tables": [{"name": "dwd_missing_database"}],
        }
    )
    missing_field_name = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "dw",
            "tables": [
                {
                    "name": "dwd_missing_field_name",
                    "fields": [{"type": "bigint"}],
                }
            ],
        }
    )
    missing_field_type = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "dw",
            "tables": [
                {
                    "name": "dwd_missing_field_type",
                    "fields": [{"name": "school_id"}],
                }
            ],
        }
    )
    valid = service.sync_from_payload(
        {
            "source_id": "maxcompute-prod",
            "database": "dw",
            "tables": [
                {
                    "name": "dwd_comment_empty_optional",
                    "fields": [{"name": "school_id", "type": "bigint"}],
                    "usage": [{"source_type": "", "source_ref": ""}],
                    "lineage": [{"target_type": "", "target_ref": ""}],
                }
            ],
        }
    )
    tables = service.list_tables(keyword="empty_optional", page=1, page_size=10)
    table_id = tables["items"][0]["id"]

    assert missing_database["status"] == "failed"
    assert "database is required" in missing_database["error_message"]
    assert missing_field_name["status"] == "failed"
    assert "field name is required" in missing_field_name["error_message"]
    assert missing_field_type["status"] == "failed"
    assert "field type is required" in missing_field_type["error_message"]
    assert valid["status"] == "success"
    assert valid["stats"]["usage_count"] == 0
    assert valid["stats"]["lineage_count"] == 0
    assert service.get_table(table_id)["name"] == "dwd_comment_empty_optional"
    assert service.list_sync_runs(page=1, page_size=10)["total"] == 4
    assert service.list_fields("missing") is None
    assert service.build_table_evidence("missing") is None
