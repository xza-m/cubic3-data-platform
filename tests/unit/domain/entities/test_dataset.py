"""
数据集实体测试
"""
import pytest
from unittest.mock import MagicMock, PropertyMock, patch
from app.domain.entities.dataset import Dataset
from app.shared.enums import DatasetSyncStatus, DatasetType


class TestDataset:
    """数据集实体测试"""
    
    def test_create_dataset_with_valid_data(self):
        """测试创建有效数据集"""
        dataset = Dataset(
            dataset_code="test_orders",
            dataset_name="订单数据集",
            source_id=1,
            physical_table="prod_db.orders",
            created_by="admin"
        )
        
        assert dataset.dataset_code == "test_orders"
        assert dataset.dataset_name == "订单数据集"
        assert dataset.source_id == 1
        assert dataset.physical_table == "prod_db.orders"
    
    def test_dataset_default_sync_status(self):
        """测试数据集默认同步状态（sync_status 字段，Column default 在 INSERT 后生效）"""
        dataset = Dataset(
            dataset_code="test_ds",
            dataset_name="测试数据集",
            source_id=1,
            physical_table="db.table",
            sync_status=DatasetSyncStatus.SYNCED.value,  # 显式传入，验证字段可赋值
        )

        assert dataset.sync_status == DatasetSyncStatus.SYNCED.value
    
    def test_dataset_with_description(self):
        """测试带描述的数据集"""
        dataset = Dataset(
            dataset_code="test_ds",
            dataset_name="测试数据集",
            source_id=1,
            physical_table="db.table",
            description="这是一个测试数据集"
        )
        
        assert dataset.description == "这是一个测试数据集"
    
    def test_dataset_owner(self):
        """测试数据集责任人"""
        dataset = Dataset(
            dataset_code="test_ds",
            dataset_name="测试数据集",
            source_id=1,
            physical_table="db.table",
            owner="data_team"
        )
        
        assert dataset.owner == "data_team"

    def test_domain_events_can_be_recorded_and_cleared_without_existing_list(self):
        dataset = Dataset(
            dataset_code="event_ds",
            dataset_name="事件数据集",
            source_id=1,
            physical_table="db.table",
        )
        del dataset._domain_events

        dataset.record_event("created")
        dataset.record_event("synced")

        assert dataset.clear_events() == ["created", "synced"]
        assert dataset.clear_events() == []

    def test_clear_events_initializes_missing_event_list(self):
        dataset = Dataset(
            dataset_code="no_event_ds",
            dataset_name="空事件数据集",
            source_id=1,
            physical_table="db.table",
        )
        del dataset._domain_events

        assert dataset.clear_events() == []
        assert dataset._domain_events == []

    def test_sync_lifecycle_updates_status_and_errors(self):
        dataset = Dataset(
            dataset_code="sync_ds",
            dataset_name="同步数据集",
            source_id=1,
            physical_table="db.table",
            sync_status=DatasetSyncStatus.SYNCED.value,
        )

        dataset.start_sync()
        assert dataset.sync_status == DatasetSyncStatus.SYNCING.value

        dataset.complete_sync(field_count=12)
        assert dataset.sync_status == DatasetSyncStatus.SYNCED.value
        assert dataset.last_sync_at is not None
        assert dataset.sync_error is None

        dataset.fail_sync("schema mismatch")
        assert dataset.sync_status == DatasetSyncStatus.FAILED.value
        assert dataset.sync_error == "schema mismatch"

    def test_is_ready_and_soft_delete(self):
        dataset = Dataset(
            dataset_code="ready_ds",
            dataset_name="就绪数据集",
            source_id=1,
            physical_table="db.table",
            sync_status=DatasetSyncStatus.SYNCED.value,
            is_deleted=False,
        )

        assert dataset.is_ready() is True

        dataset.soft_delete()
        assert dataset.is_deleted is True
        assert dataset.is_ready() is False

    def test_field_queries_delegate_to_dynamic_relationship(self):
        dataset = Dataset(
            dataset_code="fields_ds",
            dataset_name="字段数据集",
            source_id=1,
            physical_table="db.table",
        )
        fields = MagicMock()
        first_query = MagicMock()
        partition_query = MagicMock()
        fields.filter_by.side_effect = [first_query, partition_query]
        first_query.first.return_value = {"physical_name": "user_id"}
        fields.filter.return_value.all.return_value = [{"physical_name": "mobile"}]
        partition_query.all.return_value = [{"physical_name": "ds"}]

        with patch.object(Dataset, "fields", new_callable=PropertyMock, return_value=fields):
            first_result = dataset.get_field_by_name("user_id")
            sensitive_result = dataset.get_sensitive_fields()
            partition_result = dataset.get_partition_fields()

        assert first_result == {"physical_name": "user_id"}
        assert sensitive_result == [{"physical_name": "mobile"}]
        assert partition_result == [{"physical_name": "ds"}]

    def test_to_dict_handles_source_resolution_fields_and_field_count(self):
        dataset = Dataset(
            id=7,
            dataset_code="serialized_ds",
            dataset_name="序列化数据集",
            dataset_type=DatasetType.VIRTUAL.value,
            source_id=2,
            physical_table=None,
            sql_query="SELECT 1",
            file_metadata={"file_name": "orders.csv"},
            description="虚拟数据集",
            owner="alice",
            schema_snapshot={"columns": ["id"]},
            partition_fields=["ds"],
            dimension_fields=["user_id"],
            metric_fields=["amount"],
            sync_status=DatasetSyncStatus.SYNCED.value,
            created_by="alice",
        )
        dataset.source = MagicMock(source_type="postgresql")
        fields = MagicMock()
        fields.all.return_value = [MagicMock(to_dict=MagicMock(return_value={"name": "id"}))]
        fields.count.return_value = 1

        with patch.object(Dataset, "fields", new_callable=PropertyMock, return_value=fields):
            with_fields = dataset.to_dict(include_fields=True)

        assert with_fields["source_type"] == "postgresql"
        assert with_fields["dataset_type"] == DatasetType.VIRTUAL.value
        assert with_fields["fields"] == [{"name": "id"}]
        assert with_fields["field_count"] == 1

        dataset_no_fields = Dataset(
            dataset_code="count_ds",
            dataset_name="计数字段",
            source_id=3,
            physical_table="dw.count_ds",
        )
        dataset_no_fields.field_count = 4
        dataset_no_fields.source_type = "clickhouse"

        without_fields = dataset_no_fields.to_dict(include_fields=False)

        assert without_fields["source_type"] == "clickhouse"
        assert without_fields["field_count"] == 4
        assert repr(dataset_no_fields) == "<Dataset count_ds>"
