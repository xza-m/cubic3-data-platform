"""
创建数据集Handler测试
"""
import pytest
from unittest.mock import Mock, MagicMock
from app.application.dataset.handlers.create_dataset_handler import CreateDatasetHandler
from app.application.dataset.commands.create_dataset import CreateDatasetCommand


class TestCreateDatasetHandler:
    """创建数据集Handler测试"""
    
    @pytest.fixture
    def mock_repository(self):
        return Mock()
    
    @pytest.fixture
    def handler(self, mock_repository):
        return CreateDatasetHandler(repository=mock_repository, event_bus=Mock())
    
    def test_handle_creates_dataset_successfully(self, handler, mock_repository):
        """测试成功创建数据集"""
        command = CreateDatasetCommand(
            dataset_code="test_orders",
            dataset_name="订单数据集",
            source_id=1,
            physical_table="prod.orders",
            fields=[],
            created_by="admin",
        )
        
        mock_repository.find_by_code.return_value = None  # 不重复

        mock_dataset = MagicMock()
        mock_dataset.id = 1
        mock_dataset.dataset_code = "test_orders"
        mock_repository.save.return_value = mock_dataset

        result = handler.handle(command)

        assert result.id == 1
        assert result.dataset_code == "test_orders"
        mock_repository.save.assert_called_once()
