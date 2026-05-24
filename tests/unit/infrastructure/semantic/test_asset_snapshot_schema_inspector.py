from app.infrastructure.semantic.asset_snapshot_schema_inspector import (
    AssetSnapshotSchemaInspector,
)
from app.domain.semantic.data_asset import AssetSnapshot, AssetTable
from app.domain.semantic.ports.schema_inspector import ISchemaInspector


class FallbackInspector(ISchemaInspector):
    def get_table_columns(self, table_name):
        if table_name == "fallback_table":
            return [{"name": "id", "type": "BIGINT"}]
        return []

    def fetch_dict_enums(self, dict_type):
        if dict_type == "fallback_enum":
            return {"1": "启用"}
        return None


def test_asset_snapshot_schema_inspector_reads_common_snapshot_shapes():
    inspector = AssetSnapshotSchemaInspector(
        {
            "dw.orders": {
                "columns": [
                    {"name": "order_id", "type": "BIGINT"},
                    {"physical_name": "status", "data_type": "STRING"},
                ]
            },
            "dw.users": {
                "schema_snapshot": {
                    "columns": [
                        {"name": "user_id", "type": "string"},
                    ]
                }
            },
            "plain_table": [
                {"name": "ds", "type": "STRING"},
            ],
        }
    )

    assert inspector.get_table_columns("DW.ORDERS") == [
        {"name": "order_id", "type": "BIGINT"},
        {"name": "status", "type": "STRING"},
    ]
    assert inspector.get_table_columns("dw.users") == [
        {"name": "user_id", "type": "STRING"},
    ]
    assert inspector.get_table_columns("plain_table") == [
        {"name": "ds", "type": "STRING"},
    ]
    assert inspector.get_table_columns("missing") == []


def test_asset_snapshot_schema_inspector_can_use_lookup_and_enum_provider():
    def lookup(table_name):
        if table_name == "orders":
            return {"fields": [{"physical_name": "amount", "data_type": "decimal"}]}
        return None

    inspector = AssetSnapshotSchemaInspector(
        lookup,
        enum_provider=lambda dict_type: {"paid": "已支付"} if dict_type == "order_status" else None,
    )

    assert inspector.get_table_columns("orders") == [
        {"name": "amount", "type": "DECIMAL"},
    ]
    assert inspector.fetch_dict_enums("order_status") == {"paid": "已支付"}
    assert inspector.fetch_dict_enums("unknown") is None


def test_asset_snapshot_schema_inspector_falls_back_when_snapshot_missing():
    inspector = AssetSnapshotSchemaInspector(
        {"snapshot_table": [{"name": "snapshot_id", "type": "STRING"}]},
        fallback_inspector=FallbackInspector(),
    )

    assert inspector.get_table_columns("snapshot_table") == [
        {"name": "snapshot_id", "type": "STRING"},
    ]
    assert inspector.get_table_columns("fallback_table") == [
        {"name": "id", "type": "BIGINT"},
    ]
    assert inspector.fetch_dict_enums("fallback_enum") == {"1": "启用"}


def test_asset_snapshot_schema_inspector_can_lookup_latest_schema_snapshot_from_repository():
    class FakeRepository:
        def list_tables(self, *, keyword="", page=1, page_size=20):
            assert keyword == "orders"
            return {
                "items": [
                    AssetTable(
                        id="tbl_orders",
                        source_id="maxcompute-prod",
                        database="dw",
                        name="orders",
                    )
                ],
                "total": 1,
            }

        def latest_snapshot(self, table_id, *, snapshot_type="schema"):
            assert table_id == "tbl_orders"
            assert snapshot_type == "schema"
            return AssetSnapshot(
                id="snap_orders",
                table_id="tbl_orders",
                snapshot_type="schema",
                payload={"columns": [{"name": "order_id", "type": "bigint"}]},
            )

    inspector = AssetSnapshotSchemaInspector.from_repository(FakeRepository())

    assert inspector.get_table_columns("dw.orders") == [
        {"name": "order_id", "type": "BIGINT"}
    ]
