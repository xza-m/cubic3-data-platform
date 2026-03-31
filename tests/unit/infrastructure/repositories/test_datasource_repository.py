"""
数据源仓储测试（使用 mock session 隔离 DB）
"""
import pytest
from unittest.mock import MagicMock
from sqlalchemy.orm import Session
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.domain.entities.data_source import DataSource


def _make_repo():
    """创建 DatasourceRepository 并注入 mock session"""
    mock_session = MagicMock(spec=Session)
    repo = DatasourceRepository(session=mock_session)
    return repo, mock_session


class TestDatasourceRepository:
    """数据源仓储测试"""

    def test_save_datasource(self):
        """测试保存数据源"""
        repo, mock_session = _make_repo()

        datasource = DataSource(
            name="Test DB",
            source_type="postgresql",
            connection_config={"host": "localhost"},
            created_by="admin",
        )
        datasource.id = 1
        mock_session.refresh.side_effect = lambda obj: None  # refresh 无副作用

        result = repo.save(datasource)

        mock_session.add.assert_called_once_with(datasource)
        mock_session.commit.assert_called_once()

    def test_find_by_id_found(self):
        """测试根据 ID 获取数据源"""
        repo, mock_session = _make_repo()

        expected = DataSource(
            name="Test DB",
            source_type="mysql",
            connection_config={},
            created_by="admin",
        )
        expected.id = 42
        mock_session.query.return_value.filter_by.return_value.first.return_value = expected

        result = repo.find_by_id(42)

        assert result is expected
        assert result.name == "Test DB"

    def test_find_by_id_not_found(self):
        """测试获取不存在的数据源"""
        repo, mock_session = _make_repo()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None

        result = repo.find_by_id(99999)

        assert result is None

    def test_delete_datasource(self):
        """测试删除数据源"""
        repo, mock_session = _make_repo()

        datasource = DataSource(
            name="To Delete",
            source_type="postgresql",
            connection_config={},
            created_by="admin",
        )
        datasource.id = 7

        repo.delete(datasource)

        mock_session.delete.assert_called_once_with(datasource)
        mock_session.commit.assert_called_once()

    def test_find_by_name_and_find_all(self):
        """测试按名称查询和查询全部"""
        repo, mock_session = _make_repo()

        datasource = DataSource(
            name="Warehouse",
            source_type="postgresql",
            connection_config={},
            created_by="admin",
        )
        query = mock_session.query.return_value
        query.filter_by.return_value.first.return_value = datasource
        query.all.return_value = [datasource]

        assert repo.find_by_name("Warehouse") is datasource
        assert repo.find_all() == [datasource]

    def test_exists_by_name_without_and_with_exclude_id(self):
        """测试名称存在性检查"""
        repo, mock_session = _make_repo()

        query = mock_session.query.return_value
        filter_query = MagicMock()
        query.filter_by.return_value = filter_query
        filter_query.first.return_value = object()

        assert repo.exists_by_name("Warehouse") is True

        filter_query.first.return_value = None
        filter_query.filter.return_value = filter_query

        assert repo.exists_by_name("Warehouse", exclude_id=1) is False
        filter_query.filter.assert_called_once()
