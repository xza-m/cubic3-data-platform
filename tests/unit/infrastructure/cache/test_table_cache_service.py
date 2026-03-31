"""
表缓存服务单元测试

测试 get_cached_tables、refresh_expired_caches、clear_datasource_caches、get_cache_stats 等
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session

from app.infrastructure.cache.table_cache_service import TableCacheService


def _make_service(mock_session=None):
    """创建 TableCacheService 并注入 mock session"""
    session = mock_session or MagicMock(spec=Session)
    return TableCacheService(session=session), session


class TestGetCachedTables:
    """get_cached_tables 测试"""

    def test_cache_hit(self):
        """缓存命中时返回缓存数据"""
        service, mock_session = _make_service()
        mock_cache = MagicMock()
        mock_cache.table_list = [{"name": "t1"}, {"name": "t2"}]
        mock_cache.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        mock_cache.last_access_at = None
        mock_cache.access_count = 0

        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_cache

        with patch("app.infrastructure.cache.table_cache_service.utcnow", return_value=datetime.now(timezone.utc)):
            tables, from_cache = service.get_cached_tables(datasource_id=1, database="db1")

        assert tables == [{"name": "t1"}, {"name": "t2"}]
        assert from_cache is True
        mock_session.commit.assert_called_once()

    def test_cache_miss_fetches_from_source(self):
        """缓存未命中时从数据源获取"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None

        with patch("app.infrastructure.cache.table_cache_service.utcnow", return_value=datetime.now(timezone.utc)):
            with patch.object(service, "_fetch_tables_from_source", return_value=[{"name": "t1"}]) as mock_fetch:
                with patch.object(service, "save_cache") as mock_save:
                    tables, from_cache = service.get_cached_tables(datasource_id=1, database="db1")

        assert tables == [{"name": "t1"}]
        assert from_cache is False
        mock_fetch.assert_called_once_with(1, "db1")
        mock_save.assert_called_once_with(1, "db1", [{"name": "t1"}])

    def test_cache_expired_fetches_from_source(self):
        """缓存过期时从数据源获取"""
        service, mock_session = _make_service()
        mock_cache = MagicMock()
        mock_cache.table_list = [{"name": "old"}]
        mock_cache.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)  # 已过期

        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_cache
        now = datetime.now(timezone.utc)

        with patch("app.infrastructure.cache.table_cache_service.utcnow", return_value=now):
            with patch.object(service, "_fetch_tables_from_source", return_value=[{"name": "new"}]) as mock_fetch:
                with patch.object(service, "save_cache") as mock_save:
                    tables, from_cache = service.get_cached_tables(datasource_id=1, database="db1")

        assert tables == [{"name": "new"}]
        assert from_cache is False
        mock_fetch.assert_called_once_with(1, "db1")
        mock_save.assert_called_once_with(1, "db1", [{"name": "new"}])

    def test_force_refresh_ignores_cache(self):
        """force_refresh=True 时忽略缓存"""
        service, mock_session = _make_service()
        mock_cache = MagicMock()
        mock_cache.table_list = [{"name": "cached"}]
        mock_cache.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_cache

        with patch.object(service, "_fetch_tables_from_source", return_value=[{"name": "fresh"}]) as mock_fetch:
            with patch.object(service, "save_cache") as mock_save:
                tables, from_cache = service.get_cached_tables(
                    datasource_id=1, database="db1", force_refresh=True
                )

        assert tables == [{"name": "fresh"}]
        assert from_cache is False
        mock_fetch.assert_called_once_with(1, "db1")

    def test_cache_hit_update_stats_failure_rollback(self):
        """缓存命中但更新统计失败时回滚，仍返回缓存数据"""
        service, mock_session = _make_service()
        mock_cache = MagicMock()
        mock_cache.table_list = [{"name": "t1"}]
        mock_cache.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        mock_cache.last_access_at = None
        mock_cache.access_count = 0

        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_cache
        mock_session.commit.side_effect = Exception("commit failed")

        with patch("app.infrastructure.cache.table_cache_service.utcnow", return_value=datetime.now(timezone.utc)):
            tables, from_cache = service.get_cached_tables(datasource_id=1, database="db1")

        assert tables == [{"name": "t1"}]
        assert from_cache is True
        mock_session.rollback.assert_called_once()


class TestFetchTablesFromSource:
    """_fetch_tables_from_source 测试"""

    def test_success(self):
        """数据源存在时返回表列表"""
        service, mock_session = _make_service()
        mock_ds = MagicMock()
        mock_ds.id = 1
        mock_ds.source_type = "postgresql"
        mock_ds.connection_config = {"host": "localhost"}
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_ds

        mock_adapter = MagicMock()
        mock_adapter.list_tables.return_value = [{"name": "users"}, {"name": "orders"}]

        with patch("app.infrastructure.cache.table_cache_service.AdapterFactory") as mock_factory:
            mock_factory.create_adapter.return_value = mock_adapter
            result = service._fetch_tables_from_source(1, "public")

        assert result == [{"name": "users"}, {"name": "orders"}]
        mock_adapter.list_tables.assert_called_once_with("public")

    def test_datasource_not_found_raises(self):
        """数据源不存在时抛出 ValueError"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None

        with pytest.raises(ValueError) as exc_info:
            service._fetch_tables_from_source(999, "db1")

        assert "数据源不存在" in str(exc_info.value)


class TestSaveCache:
    """save_cache 测试"""

    def test_create_new_cache(self):
        """无缓存时创建新记录"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None

        with patch("app.infrastructure.cache.table_cache_service.utcnow") as mock_utc:
            mock_utc.return_value = datetime(2025, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
            service.save_cache(1, "db1", [{"name": "t1"}])

        mock_session.add.assert_called_once()
        added = mock_session.add.call_args[0][0]
        assert added.datasource_id == 1
        assert added.database_name == "db1"
        assert added.table_list == [{"name": "t1"}]
        assert added.table_count == 1
        mock_session.commit.assert_called_once()

    def test_update_existing_cache(self):
        """有缓存时更新"""
        service, mock_session = _make_service()
        mock_cache = MagicMock()
        mock_session.query.return_value.filter_by.return_value.first.return_value = mock_cache

        with patch("app.infrastructure.cache.table_cache_service.utcnow") as mock_utc:
            mock_utc.return_value = datetime(2025, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
            service.save_cache(1, "db1", [{"name": "t1"}, {"name": "t2"}])

        assert mock_cache.table_list == [{"name": "t1"}, {"name": "t2"}]
        assert mock_cache.table_count == 2
        mock_session.add.assert_not_called()
        mock_session.commit.assert_called_once()

    def test_save_failure_rollback_raises(self):
        """保存失败时回滚并抛出"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter_by.return_value.first.return_value = None
        mock_session.commit.side_effect = Exception("db error")

        with patch("app.infrastructure.cache.table_cache_service.utcnow", return_value=datetime.now(timezone.utc)):
            with pytest.raises(Exception) as exc_info:
                service.save_cache(1, "db1", [])

        assert "db error" in str(exc_info.value)
        mock_session.rollback.assert_called_once()


class TestRefreshExpiredCaches:
    """refresh_expired_caches 测试"""

    def test_success_refreshes_all(self):
        """成功刷新所有过期缓存"""
        service, mock_session = _make_service()
        mock_cache1 = MagicMock()
        mock_cache1.datasource_id = 1
        mock_cache1.database_name = "db1"
        mock_cache2 = MagicMock()
        mock_cache2.datasource_id = 2
        mock_cache2.database_name = "db2"

        mock_session.query.return_value.filter.return_value.all.return_value = [mock_cache1, mock_cache2]

        with patch.object(service, "_fetch_tables_from_source", side_effect=[[{"t1"}], [{"t2"}]]):
            with patch.object(service, "save_cache"):
                result = service.refresh_expired_caches()

        assert result == 2

    def test_partial_failure_continues(self):
        """部分刷新失败时继续处理其余"""
        service, mock_session = _make_service()
        mock_cache1 = MagicMock()
        mock_cache1.datasource_id = 1
        mock_cache1.database_name = "db1"
        mock_cache2 = MagicMock()
        mock_cache2.datasource_id = 2
        mock_cache2.database_name = "db2"

        mock_session.query.return_value.filter.return_value.all.return_value = [mock_cache1, mock_cache2]

        def fetch_side_effect(ds_id, db):
            if ds_id == 1:
                raise ValueError("连接失败")
            return [{"t2"}]

        with patch.object(service, "_fetch_tables_from_source", side_effect=fetch_side_effect):
            with patch.object(service, "save_cache") as mock_save:
                result = service.refresh_expired_caches()

        assert result == 1
        mock_save.assert_called_once_with(2, "db2", [{"t2"}])

    def test_no_expired_caches(self):
        """无过期缓存时返回 0"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter.return_value.all.return_value = []

        result = service.refresh_expired_caches()

        assert result == 0

    def test_query_exception_returns_zero(self):
        """查询异常时返回 0"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter.side_effect = Exception("query failed")

        result = service.refresh_expired_caches()

        assert result == 0


class TestClearDatasourceCaches:
    """clear_datasource_caches 测试"""

    def test_success(self):
        """成功清除指定数据源缓存"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter_by.return_value.delete.return_value = 3

        result = service.clear_datasource_caches(datasource_id=1)

        assert result == 3
        mock_session.commit.assert_called_once()

    def test_failure_rollback_returns_zero(self):
        """失败时回滚并返回 0"""
        service, mock_session = _make_service()
        mock_session.query.return_value.filter_by.return_value.delete.return_value = 2
        mock_session.commit.side_effect = Exception("commit failed")

        result = service.clear_datasource_caches(datasource_id=1)

        assert result == 0
        mock_session.rollback.assert_called_once()


class TestPruneDatasourceCaches:
    """prune_datasource_caches 测试"""

    def test_success_prunes_only_stale_databases(self):
        """保留当前数据库列表，仅删除已消失缓存。"""
        service, mock_session = _make_service()
        stale_query = MagicMock()
        stale_query.delete.return_value = 2
        mock_session.query.return_value.filter_by.return_value.filter.return_value = stale_query

        result = service.prune_datasource_caches(datasource_id=1, active_databases=["dw", "ads"])

        assert result == 2
        mock_session.commit.assert_called_once()
        stale_query.delete.assert_called_once_with(synchronize_session=False)

    def test_empty_active_list_clears_all_datasource_caches(self):
        """当前无数据库时，清空该数据源的全部缓存。"""
        service, mock_session = _make_service()
        filtered_query = MagicMock()
        filtered_query.delete.return_value = 3
        mock_session.query.return_value.filter_by.return_value = filtered_query

        result = service.prune_datasource_caches(datasource_id=1, active_databases=[])

        assert result == 3
        filtered_query.delete.assert_called_once_with(synchronize_session=False)
        mock_session.commit.assert_called_once()

    def test_failure_rolls_back_and_returns_zero(self):
        """删除失败时回滚并返回 0。"""
        service, mock_session = _make_service()
        filtered_query = MagicMock()
        filtered_query.delete.side_effect = Exception("delete failed")
        mock_session.query.return_value.filter_by.return_value = filtered_query

        result = service.prune_datasource_caches(datasource_id=1, active_databases=[])

        assert result == 0
        mock_session.rollback.assert_called_once()


class TestGetCacheStats:
    """get_cache_stats 测试"""

    def test_success(self):
        """成功返回统计"""
        service, mock_session = _make_service()
        mock_session.query.return_value.count.return_value = 10
        mock_session.query.return_value.filter.return_value.count.return_value = 3  # expired

        result = service.get_cache_stats()

        assert result["total_caches"] == 10
        assert result["expired_caches"] == 3
        assert result["valid_caches"] == 7  # total - expired

    def test_exception_returns_zeros(self):
        """异常时返回全零"""
        service, mock_session = _make_service()
        mock_session.query.return_value.count.side_effect = Exception("db error")

        result = service.get_cache_stats()

        assert result["total_caches"] == 0
        assert result["valid_caches"] == 0
        assert result["expired_caches"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
