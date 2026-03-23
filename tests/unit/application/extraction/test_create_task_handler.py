"""
创建提取任务Handler测试
"""
import pytest
from unittest.mock import Mock, MagicMock
from app.application.extraction.handlers.create_task_handler import CreateTaskHandler
from app.application.extraction.commands.create_task import CreateTaskCommand


class TestCreateTaskHandler:
    """创建提取任务Handler测试"""
    
    @pytest.fixture
    def mock_extraction_repo(self):
        return Mock()
    
    @pytest.fixture
    def mock_dataset_repo(self):
        return Mock()
    
    @pytest.fixture
    def mock_permission_checker(self):
        checker = MagicMock()
        checker.check_field_access.return_value = None
        return checker

    @pytest.fixture
    def mock_sql_generator(self):
        gen = MagicMock()
        gen.generate_sql.return_value = "SELECT id FROM db.table LIMIT 10"
        return gen

    @pytest.fixture
    def handler(self, mock_extraction_repo, mock_dataset_repo, mock_permission_checker, mock_sql_generator):
        return CreateTaskHandler(
            extraction_repository=mock_extraction_repo,
            dataset_repository=mock_dataset_repo,
            permission_checker=mock_permission_checker,
            sql_generator=mock_sql_generator,
        )
    
    def test_handle_creates_task_successfully(self, handler, mock_extraction_repo, mock_dataset_repo, mock_permission_checker, mock_sql_generator):
        """测试成功创建提取任务"""
        command = CreateTaskCommand(
            task_name="每日订单提取",
            dataset_id=1,
            select_fields=["id", "amount"],
            filter_conditions={},
            created_by="admin"
        )
        
        # Mock数据集存在（repository 方法名为 find_by_id）
        mock_dataset = MagicMock()
        mock_dataset.id = 1
        mock_dataset_repo.find_by_id.return_value = mock_dataset
        
        # Mock任务创建（extraction_repository 使用 save）
        mock_task = MagicMock()
        mock_task.id = 1
        mock_task.task_name = "每日订单提取"
        mock_extraction_repo.save.return_value = mock_task
        
        result = handler.handle(command)
        
        assert result.id == 1
        assert result.task_name == "每日订单提取"
        mock_dataset_repo.find_by_id.assert_called_once_with(1)
        mock_extraction_repo.save.assert_called_once()
