"""
创建数据源Handler测试
"""
import pytest
from unittest.mock import Mock, MagicMock
from app.application.datasource.handlers.create_datasource_handler import CreateDatasourceHandler
from app.application.datasource.commands.create_datasource import CreateDatasourceCommand
from app.domain.entities.data_source import Datasource


class TestCreateDatasourceHandler:
    """创建数据源Handler测试"""
    
    @pytest.fixture
    def mock_repository(self):
        """Mock仓储"""
        return Mock()
    
    @pytest.fixture
    def handler(self, mock_repository):
        """Handler实例"""
        return CreateDatasourceHandler(repository=mock_repository, event_bus=Mock())
    
    def test_handle_creates_datasource_successfully(self, handler, mock_repository):
        """测试成功创建数据源"""
        command = CreateDatasourceCommand(
            name="Test PostgreSQL",
            source_type="postgresql",
            connection_config={
                "host": "localhost",
                "port": 5432,
                "database": "test"
            },
            created_by="admin",
        )

        # Mock 名称不重复，且 save 返回实体
        mock_repository.exists_by_name.return_value = False
        mock_datasource = MagicMock(spec=Datasource)
        mock_datasource.id = 1
        mock_datasource.name = "Test PostgreSQL"
        mock_datasource.source_type = "postgresql"
        mock_repository.save.return_value = mock_datasource

        result = handler.handle(command)

        assert result.id == 1
        assert result.name == "Test PostgreSQL"
        assert result.source_type == "postgresql"
        mock_repository.save.assert_called_once()
    
    def test_handle_with_description(self, handler, mock_repository):
        """测试带描述创建数据源"""
        command = CreateDatasourceCommand(
            name="MySQL DB",
            source_type="mysql",
            connection_config={"host": "localhost"},
            description="测试MySQL数据库",
            created_by="admin",
        )

        mock_repository.exists_by_name.return_value = False
        mock_datasource = MagicMock()
        mock_datasource.description = "测试MySQL数据库"
        mock_repository.save.return_value = mock_datasource

        result = handler.handle(command)

        assert result.description == "测试MySQL数据库"
