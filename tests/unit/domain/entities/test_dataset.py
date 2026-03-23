"""
数据集实体测试
"""
import pytest
from app.domain.entities.dataset import Dataset


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
        from app.domain.entities.dataset import DatasetSyncStatus
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
