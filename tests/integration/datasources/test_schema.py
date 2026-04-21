# tests/integration/datasources/test_schema.py
"""
B-back-5 集成测试：数据源 Schema 浏览接口。

覆盖：
  - happy:    mock connector 返回 schema，三层接口均正常
  - boundary: refresh=1 绕过缓存；空表列表
  - error:    数据源不存在；connector 抛异常

@pytest.mark.redesign
"""
import pytest
from unittest.mock import MagicMock, patch
from flask import Flask

from app.application.datasources.schema_browser_service import SchemaBrowserService, _TTLCache


# ============================================================================
# Unit tests for SchemaBrowserService (no HTTP)
# ============================================================================

def _make_mock_datasource(source_type="postgresql"):
    ds = MagicMock()
    ds.id = 1
    ds.source_type = source_type
    ds.connection_config = {"host": "localhost", "database": "test"}
    return ds


_DEFAULT_TABLES = [
    {"table_name": "user_event", "comment": "用户事件表", "row_count": 1000000},
    {"table_name": "order_fact", "comment": "订单事实表", "row_count": 500000},
]


def _make_mock_adapter(databases=None, tables=None, columns=None):
    adapter = MagicMock()
    adapter.list_databases.return_value = databases if databases is not None else ["ods", "dwd"]
    adapter.list_tables.return_value = tables if tables is not None else _DEFAULT_TABLES
    adapter.get_table_schema.return_value = {
        "table_name": "user_event",
        "columns": [
            {"name": "id", "type": "bigint", "is_nullable": False, "comment": "主键"},
            {"name": "user_id", "type": "bigint", "is_nullable": False, "comment": "用户 ID"},
            {"name": "event_type", "type": "varchar", "is_nullable": True, "comment": "事件类型"},
        ],
        "row_count": 1000000,
    }
    return adapter


def _make_isolated_service(datasource=None):
    """每次调用生成使用独立缓存的 SchemaBrowserService，防止测试间污染。"""
    from app.application.datasources.schema_browser_service import _TTLCache
    repo = MagicMock()
    repo.find_by_id.return_value = datasource or _make_mock_datasource()
    return SchemaBrowserService(datasource_repository=repo, cache=_TTLCache())


@pytest.mark.redesign
class TestSchemaBrowserServiceUnit:
    """SchemaBrowserService 单元测试（直接调用，无 HTTP）。"""

    def test_list_databases_happy(self):
        """Happy: 返回数据库列表，含 fetched_at。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()

        with patch.object(svc, "_get_adapter", return_value=adapter):
            result = svc.list_databases(1)

        assert "databases" in result
        assert "ods" in result["databases"]
        assert "fetched_at" in result

    def test_list_databases_uses_cache(self):
        """Boundary: 第二次调用命中缓存，adapter 只调用一次。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()

        call_count = [0]
        original_get_adapter = svc._get_adapter

        def counting_get_adapter(ds_id):
            call_count[0] += 1
            return adapter

        with patch.object(svc, "_get_adapter", side_effect=counting_get_adapter):
            svc.list_databases(1)
            svc.list_databases(1)  # 应命中缓存
        assert call_count[0] == 1

    def test_list_databases_refresh_bypasses_cache(self):
        """Boundary: refresh=True 强制重拉，adapter 调用两次。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()

        call_count = [0]

        def counting_get_adapter(ds_id):
            call_count[0] += 1
            return adapter

        with patch.object(svc, "_get_adapter", side_effect=counting_get_adapter):
            svc.list_databases(1)
            svc.list_databases(1, refresh=True)
        assert call_count[0] == 2

    def test_list_tables_happy(self):
        """Happy: 返回表列表，含 table_name / comment。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()

        with patch.object(svc, "_get_adapter", return_value=adapter):
            result = svc.list_tables(1, "ods")

        assert "tables" in result
        assert len(result["tables"]) == 2
        assert result["tables"][0]["table_name"] == "user_event"

    def test_get_table_schema_happy(self):
        """Happy: 返回字段详情，含 columns + row_count_estimate。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()

        with patch.object(svc, "_get_adapter", return_value=adapter):
            result = svc.get_table_schema(1, "ods", "user_event")

        assert "columns" in result
        assert len(result["columns"]) == 3
        assert result["columns"][0]["name"] == "id"
        assert result["columns"][0]["nullable"] is False
        assert "row_count_estimate" in result
        assert "fetched_at" in result

    def test_datasource_not_found_raises(self):
        """Error: 数据源不存在时抛出 ApplicationException。"""
        from app.shared.exceptions import ApplicationException
        from app.application.datasources.schema_browser_service import _TTLCache
        repo = MagicMock()
        repo.find_by_id.return_value = None
        svc = SchemaBrowserService(datasource_repository=repo, cache=_TTLCache())

        with pytest.raises(ApplicationException):
            svc.list_databases(999)

    def test_adapter_error_raises_application_exception(self):
        """Error: connector 异常被包装为 ApplicationException。"""
        from app.shared.exceptions import ApplicationException
        adapter = MagicMock()
        adapter.list_databases.side_effect = ConnectionError("连接超时")
        svc = _make_isolated_service()

        with patch.object(svc, "_get_adapter", return_value=adapter):
            with pytest.raises(ApplicationException):
                svc.list_databases(1)

    def test_empty_table_list(self):
        """Boundary: 表为空时返回 empty list 而非 None。"""
        adapter = _make_mock_adapter(tables=[])
        svc = _make_isolated_service()

        with patch.object(svc, "_get_adapter", return_value=adapter):
            result = svc.list_tables(1, "empty_db")

        assert result["tables"] == []


@pytest.mark.redesign
class TestTTLCache:
    """_TTLCache 边界行为。"""

    def test_set_and_get(self):
        cache = _TTLCache(ttl=60)
        cache.set("k", {"v": 1})
        assert cache.get("k") == {"v": 1}

    def test_expired_returns_none(self):
        import time
        cache = _TTLCache(ttl=0.001)  # 极短 TTL
        cache.set("k", "v")
        time.sleep(0.01)
        assert cache.get("k") is None

    def test_invalidate_prefix(self):
        cache = _TTLCache(ttl=60)
        cache.set("ds:1:dbs", "val1")
        cache.set("ds:1:db:ods:tables", "val2")
        cache.set("ds:2:dbs", "val3")
        cache.invalidate_prefix("ds:1:")
        assert cache.get("ds:1:dbs") is None
        assert cache.get("ds:1:db:ods:tables") is None
        assert cache.get("ds:2:dbs") == "val3"

    def test_invalidate_single_key(self):
        """invalidate 仅删除指定 key（命中 line 51）。"""
        cache = _TTLCache(ttl=60)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.invalidate("a")
        assert cache.get("a") is None
        assert cache.get("b") == 2
        cache.invalidate("never_set")  # 幂等：不存在的 key 不报错


@pytest.mark.redesign
class TestSchemaBrowserServiceCacheAndErrorBranches:
    """补充缓存命中与 adapter 异常包装分支（line 106 / 111-112 / 145 / 150-151）。"""

    def test_list_tables_uses_cache(self):
        """list_tables 第二次调用命中缓存（line 106）。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()
        call_count = [0]

        def counting_get_adapter(_ds_id):
            call_count[0] += 1
            return adapter

        with patch.object(svc, "_get_adapter", side_effect=counting_get_adapter):
            svc.list_tables(1, "ods")
            svc.list_tables(1, "ods")
        assert call_count[0] == 1

    def test_list_tables_adapter_error_wrapped(self):
        """list_tables adapter 抛错被包装为 ApplicationException（line 111-112）。"""
        from app.shared.exceptions import ApplicationException

        adapter = MagicMock()
        adapter.list_tables.side_effect = RuntimeError("boom")
        svc = _make_isolated_service()
        with patch.object(svc, "_get_adapter", return_value=adapter):
            with pytest.raises(ApplicationException, match="获取表列表失败"):
                svc.list_tables(1, "ods")

    def test_get_table_schema_uses_cache(self):
        """get_table_schema 第二次调用命中缓存（line 145）。"""
        adapter = _make_mock_adapter()
        svc = _make_isolated_service()
        call_count = [0]

        def counting_get_adapter(_ds_id):
            call_count[0] += 1
            return adapter

        with patch.object(svc, "_get_adapter", side_effect=counting_get_adapter):
            svc.get_table_schema(1, "ods", "user_event")
            svc.get_table_schema(1, "ods", "user_event")
        assert call_count[0] == 1

    def test_get_table_schema_adapter_error_wrapped(self):
        """get_table_schema adapter 抛错被包装（line 150-151）。"""
        from app.shared.exceptions import ApplicationException

        adapter = MagicMock()
        adapter.get_table_schema.side_effect = RuntimeError("network down")
        svc = _make_isolated_service()
        with patch.object(svc, "_get_adapter", return_value=adapter):
            with pytest.raises(ApplicationException, match="获取表 Schema 失败"):
                svc.get_table_schema(1, "ods", "tbl")

    def test_get_adapter_invokes_factory_when_datasource_present(self):
        """_get_adapter 真实路径：datasource 存在时调用 AdapterFactory（line 179-180）。"""
        repo = MagicMock()
        repo.find_by_id.return_value = _make_mock_datasource("postgresql")
        svc = SchemaBrowserService(datasource_repository=repo, cache=_TTLCache())

        with patch(
            "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
            return_value=MagicMock(),
        ) as factory:
            svc._get_adapter(1)

        assert factory.called
        args, _ = factory.call_args
        assert args[0] == "postgresql"
