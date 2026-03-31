from unittest.mock import Mock

import pytest

from app.infrastructure.semantic.adapter_schema_inspector import AdapterSchemaInspector
from app.infrastructure.semantic.maxcompute_schema_inspector import MaxComputeSchemaInspector


def test_adapter_schema_inspector_maps_table_columns_and_defaults():
    adapter = Mock()
    adapter.get_table_schema.return_value = {
        "columns": [
            {"name": "id", "type": "BIGINT"},
            {"type": "STRING"},
            {"name": "status"},
        ]
    }

    inspector = AdapterSchemaInspector(adapter=adapter, database="dw", source_type="postgresql")

    assert inspector.get_table_columns("orders") == [
        {"name": "id", "type": "BIGINT"},
        {"name": "", "type": "STRING"},
        {"name": "status", "type": "STRING"},
    ]
    adapter.get_table_schema.assert_called_once_with("dw", "orders")


def test_adapter_schema_inspector_returns_empty_columns_on_error():
    adapter = Mock()
    adapter.get_table_schema.side_effect = RuntimeError("schema unavailable")

    inspector = AdapterSchemaInspector(adapter=adapter, database="dw", source_type="postgresql")

    assert inspector.get_table_columns("orders") == []


def test_adapter_schema_inspector_skips_enum_query_for_non_maxcompute():
    adapter = Mock()
    inspector = AdapterSchemaInspector(adapter=adapter, database="dw", source_type="postgresql")

    assert inspector.fetch_dict_enums("biz_type") is None
    adapter.execute_query.assert_not_called()


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        ({"data": [[1, "启用"], ["2", 3]]}, {"1": "启用", "2": "3"}),
        ({"rows": [["A", "Alpha"]]}, {"A": "Alpha"}),
        ({}, None),
    ],
)
def test_adapter_schema_inspector_fetches_dict_enums_for_maxcompute(result, expected):
    adapter = Mock()
    adapter.execute_query.return_value = result
    inspector = AdapterSchemaInspector(adapter=adapter, database="dw", source_type="maxcompute")

    assert inspector.fetch_dict_enums("biz_type") == expected

    adapter.execute_query.assert_called_once()
    sql = adapter.execute_query.call_args.args[0]
    assert "dim_pub_meta_dict_df" in sql
    assert "meta_dict_type = 'biz_type'" in sql
    assert adapter.execute_query.call_args.kwargs["limit"] == 1000


def test_adapter_schema_inspector_returns_none_when_enum_query_fails():
    adapter = Mock()
    adapter.execute_query.side_effect = RuntimeError("query failed")
    inspector = AdapterSchemaInspector(adapter=adapter, database="dw", source_type="maxcompute")

    assert inspector.fetch_dict_enums("biz_type") is None


def test_maxcompute_schema_inspector_maps_table_columns_and_defaults():
    adapter = Mock()
    adapter.get_table_schema.return_value = {
        "columns": [
            {"name": "ds", "type": "STRING"},
            {"name": "cnt"},
        ]
    }

    inspector = MaxComputeSchemaInspector(adapter=adapter, database="analytics")

    assert inspector.get_table_columns("dim_orders") == [
        {"name": "ds", "type": "STRING"},
        {"name": "cnt", "type": "STRING"},
    ]
    adapter.get_table_schema.assert_called_once_with("analytics", "dim_orders")


def test_maxcompute_schema_inspector_returns_empty_columns_on_error():
    adapter = Mock()
    adapter.get_table_schema.side_effect = RuntimeError("schema unavailable")

    inspector = MaxComputeSchemaInspector(adapter=adapter, database="analytics")

    assert inspector.get_table_columns("dim_orders") == []


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        ({"data": [["1", "男"], [2, "女"]]}, {"1": "男", "2": "女"}),
        ({"rows": [["unknown", "未知"]]}, {"unknown": "未知"}),
        ({}, None),
    ],
)
def test_maxcompute_schema_inspector_fetches_dict_enums(result, expected):
    adapter = Mock()
    adapter.execute_query.return_value = result
    inspector = MaxComputeSchemaInspector(adapter=adapter, database="analytics")

    assert inspector.fetch_dict_enums("gender") == expected

    adapter.execute_query.assert_called_once()
    sql = adapter.execute_query.call_args.args[0]
    assert "dim_pub_meta_dict_df" in sql
    assert "meta_dict_type = 'gender'" in sql
    assert adapter.execute_query.call_args.kwargs["limit"] == 1000


def test_maxcompute_schema_inspector_returns_none_when_enum_query_fails():
    adapter = Mock()
    adapter.execute_query.side_effect = RuntimeError("query failed")
    inspector = MaxComputeSchemaInspector(adapter=adapter, database="analytics")

    assert inspector.fetch_dict_enums("gender") is None
