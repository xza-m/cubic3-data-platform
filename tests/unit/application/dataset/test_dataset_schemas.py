"""
数据集 Pydantic Schema 测试
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.application.dataset.schemas.dataset_schemas import (
    CreateDatasetRequest,
    DatasetFieldSchema,
    DatasetListResponse,
    DatasetResponse,
    PreviewDatasetRequest,
    UpdateDatasetRequest,
)


def test_dataset_field_schema_validates_business_type_and_sensitivity_level():
    field = DatasetFieldSchema(
        physical_name="order_id",
        data_type="bigint",
        business_type="metric",
        sensitivity_level="internal",
    )
    assert field.business_type == "metric"
    assert field.sensitivity_level == "internal"

    with pytest.raises(ValidationError, match="business_type"):
        DatasetFieldSchema(physical_name="order_id", data_type="bigint", business_type="unknown")

    with pytest.raises(ValidationError, match="sensitivity_level"):
        DatasetFieldSchema(physical_name="order_id", data_type="bigint", sensitivity_level="top-secret")


def test_create_dataset_request_validates_dataset_type_requirements():
    physical = CreateDatasetRequest(
        dataset_name="订单",
        source_id=1,
        physical_table="dw.orders",
        fields=[{"physical_name": "order_id", "data_type": "bigint"}],
    )
    assert physical.dataset_type == "physical"

    virtual = CreateDatasetRequest(
        dataset_name="虚拟订单",
        source_id=1,
        sql_query="SELECT * FROM orders",
        dataset_type="virtual",
        fields=[{"physical_name": "order_id", "data_type": "bigint"}],
    )
    assert virtual.sql_query == "SELECT * FROM orders"

    file_dataset = CreateDatasetRequest(
        dataset_name="文件订单",
        dataset_type="file",
        file_metadata={"file_name": "orders.csv"},
        fields=[{"physical_name": "order_id", "data_type": "bigint"}],
    )
    assert file_dataset.file_metadata["file_name"] == "orders.csv"

    with pytest.raises(ValidationError, match="physical 数据集必须包含 source_id 与 physical_table"):
        CreateDatasetRequest(dataset_name="物理表", fields=[{"physical_name": "id", "data_type": "bigint"}])

    with pytest.raises(ValidationError, match="virtual 数据集必须包含 source_id 与 sql_query"):
        CreateDatasetRequest(
            dataset_name="虚拟表",
            dataset_type="virtual",
            source_id=1,
            fields=[{"physical_name": "id", "data_type": "bigint"}],
        )

    with pytest.raises(ValidationError, match="file 数据集必须包含 file_metadata"):
        CreateDatasetRequest(
            dataset_name="文件表",
            dataset_type="file",
            fields=[{"physical_name": "id", "data_type": "bigint"}],
        )

    with pytest.raises(ValidationError, match="dataset_type 必须为"):
        CreateDatasetRequest(
            dataset_name="未知类型",
            dataset_type="streaming",
            fields=[{"physical_name": "id", "data_type": "bigint"}],
        )


def test_dataset_response_and_list_response_support_from_attributes():
    item = SimpleNamespace(
        id=1,
        dataset_code="orders",
        dataset_name="订单",
        dataset_type="physical",
        source_id=1,
        source_type="postgresql",
        physical_table="dw.orders",
        sql_query=None,
        file_metadata=None,
        description="订单表",
        owner="alice",
        sync_status="synced",
        last_sync_at=None,
        sync_error=None,
        field_count=2,
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 2),
    )

    response = DatasetResponse.model_validate(item)
    payload = DatasetListResponse(items=[response], total=1, page=1, page_size=20, total_pages=1)

    assert response.dataset_code == "orders"
    assert payload.items[0].dataset_name == "订单"
    assert payload.total == 1


def test_update_and_preview_dataset_request_can_be_created():
    update_request = UpdateDatasetRequest(dataset_name="订单宽表", description="新描述", owner="bob")
    preview_request = PreviewDatasetRequest(datasource_id=1, database="dw", table="orders")

    assert update_request.owner == "bob"
    assert preview_request.table == "orders"
