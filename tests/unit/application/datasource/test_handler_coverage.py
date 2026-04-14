"""
数据源应用层 Handler 覆盖测试
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.application.datasource.commands.create_datasource import CreateDatasourceCommand
from app.application.datasource.commands.delete_datasource import DeleteDatasourceCommand
from app.application.datasource.commands.update_datasource import UpdateDatasourceCommand
from app.application.datasource.handlers.create_datasource_handler import CreateDatasourceHandler
from app.application.datasource.handlers.delete_datasource_handler import DeleteDatasourceHandler
from app.application.datasource.handlers.get_databases_handler import GetDatabasesHandler
from app.application.datasource.handlers.get_datasource_handler import GetDatasourceHandler
from app.application.datasource.handlers.get_schemas_handler import GetSchemasHandler
from app.application.datasource.handlers.get_statistics_handler import GetStatisticsHandler
from app.application.datasource.handlers.get_table_schema_handler import GetTableSchemaHandler
from app.application.datasource.handlers.get_tables_handler import GetTablesHandler
from app.application.datasource.handlers.list_datasources_handler import ListDatasourcesHandler
from app.application.datasource.handlers.preview_table_data_handler import PreviewTableDataHandler
from app.application.datasource.handlers.test_connection_handler import TestConnectionHandler as DatasourceTestConnectionHandler
from app.application.datasource.handlers.update_datasource_handler import UpdateDatasourceHandler
from app.application.datasource.queries.get_databases import GetDatabasesQuery
from app.application.datasource.queries.get_datasource import GetDatasourceQuery
from app.application.datasource.queries.get_schemas import GetSchemasQuery
from app.application.datasource.queries.get_statistics import GetStatisticsQuery
from app.application.datasource.queries.get_table_schema import GetTableSchemaQuery
from app.application.datasource.queries.get_tables import GetTablesQuery
from app.application.datasource.queries.list_datasources import ListDatasourcesQuery
from app.application.datasource.queries.preview_table_data import PreviewTableDataQuery
from app.application.datasource.queries.test_connection import TestConnectionQuery as DatasourceTestConnectionQuery
from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.shared.enums import ConnectionStatus
from app.shared.exceptions import ApplicationException


def _make_engine_with_connection(*execute_results):
    conn = MagicMock()
    conn.execute.side_effect = list(execute_results)
    context = MagicMock()
    context.__enter__.return_value = conn
    context.__exit__.return_value = False
    engine = MagicMock()
    engine.connect.return_value = context
    return engine, conn


def _make_scalar_result(value):
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _make_datasource(**overrides) -> DataSource:
    payload = {
        "id": 1,
        "name": "warehouse",
        "source_type": "postgresql",
        "connection_config": {"host": "db.local", "database": "dw"},
        "description": "主仓",
        "extra_config": {"ssl": True},
        "created_by": "alice",
        "is_active": True,
        "connection_status": ConnectionStatus.UNKNOWN.value,
    }
    payload.update(overrides)
    return DataSource(**payload)


def test_create_datasource_handler_validates_duplicate_and_supported_type(monkeypatch):
    repository = MagicMock()
    repository.exists_by_name.return_value = True
    handler = CreateDatasourceHandler(repository=repository, event_bus=MagicMock())
    command = CreateDatasourceCommand(
        name="warehouse",
        source_type="postgresql",
        connection_config={"host": "db.local"},
        created_by="alice",
    )

    with pytest.raises(ApplicationException, match="已存在"):
        handler.handle(command)

    repository.exists_by_name.return_value = False
    monkeypatch.setattr(
        "app.application.datasource.handlers.create_datasource_handler.AdapterFactory.get_supported_types",
        lambda: ["postgresql"],
    )

    with pytest.raises(ApplicationException, match="不支持的数据源类型"):
        handler.handle(
            CreateDatasourceCommand(
                name="ods",
                source_type="mysql",
                connection_config={"host": "db.local"},
                created_by="alice",
            )
        )


def test_create_datasource_handler_normalizes_maxcompute_and_publishes_events(monkeypatch):
    repository = MagicMock()
    event_bus = MagicMock()
    repository.exists_by_name.return_value = False
    repository.save.side_effect = lambda datasource: datasource
    handler = CreateDatasourceHandler(repository=repository, event_bus=event_bus)

    monkeypatch.setattr(
        "app.application.datasource.handlers.create_datasource_handler.AdapterFactory.get_supported_types",
        lambda: ["maxcompute", "postgresql"],
    )

    command = CreateDatasourceCommand(
        name="mc",
        source_type="maxcompute",
        connection_config={
            "project": "analytics",
            "access_key_id": "AKID",
            "access_key_secret": "SECRET",
        },
        extra_config={"region": "cn"},
        created_by="alice",
    )

    datasource = handler.handle(command)

    assert datasource.connection_config["access_id"] == "AKID"
    assert datasource.connection_config["access_key"] == "SECRET"
    assert "access_key_id" not in datasource.connection_config
    assert "access_key_secret" not in datasource.connection_config
    assert datasource.extra_config["catalog_sync"]["status"] == "pending"
    assert datasource.extra_config["catalog_sync"]["tracked_databases"] == []
    repository.save.assert_called_once_with(datasource)
    event_bus.publish_batch.assert_called_once()
    assert datasource.clear_events() == []


def test_datasource_catalog_sync_summary_lifecycle():
    datasource = _make_datasource(extra_config={})

    summary = datasource.get_catalog_sync_summary()
    assert summary["status"] == "pending"
    assert summary["tracked_databases"] == []
    assert summary["database_count"] == 0

    datasource.mark_catalog_sync_syncing()
    summary = datasource.get_catalog_sync_summary()
    assert summary["status"] == "syncing"

    datasource.mark_catalog_sync_synced(["dw", "ods"])
    summary = datasource.get_catalog_sync_summary()
    assert summary["status"] == "synced"
    assert summary["tracked_databases"] == ["dw", "ods"]
    assert summary["database_count"] == 2
    assert summary["last_run_at"] is not None
    assert summary["last_error"] is None

    datasource.mark_catalog_sync_failed("network timeout")
    summary = datasource.get_catalog_sync_summary()
    assert summary["status"] == "failed"
    assert summary["last_error"] == "network timeout"


def test_delete_datasource_handler_covers_not_found_related_dataset_and_success():
    repository = MagicMock()
    event_bus = MagicMock()
    repository.find_by_id.return_value = None
    handler = DeleteDatasourceHandler(repository=repository, event_bus=event_bus)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(DeleteDatasourceCommand(datasource_id=9))

    datasource = _make_datasource()
    datasource.datasets = [
        Dataset(
            dataset_code="orders",
            dataset_name="订单",
            source_id=1,
            physical_table="dw.orders",
        )
    ]
    repository.find_by_id.return_value = datasource

    with pytest.raises(ApplicationException, match="关联的数据集"):
        handler.handle(DeleteDatasourceCommand(datasource_id=1))

    datasource.datasets = []
    command = DeleteDatasourceCommand(datasource_id=1)
    command.deleted_by = "bob"
    handler.handle(command)

    event_bus.publish_batch.assert_called_once()
    repository.delete.assert_called_once_with(datasource)


@pytest.mark.parametrize(
    ("handler_cls", "query_obj", "adapter_method", "success_value", "error_message"),
    [
        (GetDatabasesHandler, GetDatabasesQuery(datasource_id=1), "list_databases", ["db1", "db2"], "获取数据库列表失败"),
        (GetSchemasHandler, GetSchemasQuery(datasource_id=1, database="dw"), "list_schemas", ["public"], "获取Schema列表失败"),
    ],
)
def test_simple_adapter_handlers_cover_not_found_success_and_exception(
    monkeypatch,
    handler_cls,
    query_obj,
    adapter_method,
    success_value,
    error_message,
):
    repository = MagicMock()
    repository.find_by_id.return_value = None
    handler = handler_cls(repository=repository)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(query_obj)

    datasource = _make_datasource()
    repository.find_by_id.return_value = datasource
    adapter = MagicMock()
    setattr(adapter, adapter_method, MagicMock(return_value=success_value))
    monkeypatch.setattr(
        "app.application.datasource.handlers.get_databases_handler.AdapterFactory.create_adapter"
        if handler_cls is GetDatabasesHandler
        else "app.application.datasource.handlers.get_schemas_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )

    assert handler.handle(query_obj) == success_value

    getattr(adapter, adapter_method).side_effect = RuntimeError("boom")
    with pytest.raises(ApplicationException, match=error_message):
        handler.handle(query_obj)


def test_get_datasource_handler_covers_not_found_and_success():
    repository = MagicMock()
    repository.find_by_id.return_value = None
    handler = GetDatasourceHandler(repository=repository)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(GetDatasourceQuery(datasource_id=1))

    datasource = _make_datasource()
    repository.find_by_id.return_value = datasource
    assert handler.handle(GetDatasourceQuery(datasource_id=1)) is datasource


def test_datasource_statistics_handler_returns_expected_counts():
    total_result = _make_scalar_result(4)
    active_result = _make_scalar_result(3)
    connected_result = _make_scalar_result(2)
    by_type_result = [
        SimpleNamespace(source_type="postgresql", count=2),
        SimpleNamespace(source_type="mysql", count=1),
    ]
    engine, _ = _make_engine_with_connection(total_result, active_result, connected_result, by_type_result)

    handler = GetStatisticsHandler(engine=engine)
    result = handler.handle(GetStatisticsQuery())

    assert result == {
        "total": 4,
        "active": 3,
        "connected": 2,
        "inactive": 1,
        "by_type": {"postgresql": 2, "mysql": 1},
    }


def test_get_table_schema_handler_covers_not_found_success_and_exception(monkeypatch):
    repository = MagicMock()
    repository.find_by_id.return_value = None
    handler = GetTableSchemaHandler(repository=repository)
    query = GetTableSchemaQuery(datasource_id=1, database="dw", table="orders", schema="public")

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(query)

    datasource = _make_datasource(source_type="postgresql")
    repository.find_by_id.return_value = datasource
    adapter = MagicMock()
    adapter.get_table_schema.return_value = {"columns": [{"name": "id"}]}
    monkeypatch.setattr(
        "app.application.datasource.handlers.get_table_schema_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )

    assert handler.handle(query) == {"columns": [{"name": "id"}]}
    adapter.get_table_schema.assert_called_once_with("dw", "public.orders")
    adapter.close.assert_called_once()

    adapter.reset_mock()
    repository.find_by_id.return_value = _make_datasource(source_type="mysql")
    adapter.get_table_schema.side_effect = RuntimeError("schema boom")

    with pytest.raises(ApplicationException, match="获取表Schema失败"):
        handler.handle(GetTableSchemaQuery(datasource_id=1, database="dw", table="orders", schema="ignored"))

    adapter.get_table_schema.assert_called_once_with("dw", "orders")
    adapter.close.assert_called_once()


def test_get_tables_handler_covers_not_found_force_refresh_and_container_fallback(monkeypatch):
    repository = MagicMock()
    repository.find_by_id.return_value = None
    cache_service = MagicMock()
    handler = GetTablesHandler(repository=repository, table_cache_service=cache_service)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(GetTablesQuery(datasource_id=1, database="dw"))

    repository.find_by_id.return_value = _make_datasource()
    invalidate_calls = []
    monkeypatch.setattr(
        "app.application.datasource.handlers.get_tables_handler.invalidate_cache",
        invalidate_calls.append,
    )
    cache_service.get_cached_tables.return_value = ([{"name": "orders"}], True)

    result = handler.handle(GetTablesQuery(datasource_id=1, database="dw", force_refresh=True))
    assert result == ([{"name": "orders"}], True)
    assert invalidate_calls == ["tables:1:dw"]

    cache_service_from_container = MagicMock()
    cache_service_from_container.get_cached_tables.return_value = ([{"name": "users"}], False)
    fake_container = MagicMock()
    fake_container.table_cache_service.return_value = cache_service_from_container
    monkeypatch.setattr(
        "app.di.container.get_container",
        lambda: fake_container,
    )
    handler = GetTablesHandler(repository=repository, table_cache_service=None)
    assert handler.handle(GetTablesQuery(datasource_id=1, database="dw")) == ([{"name": "users"}], False)


def test_list_datasources_handler_covers_filters_and_pagination():
    count_result = _make_scalar_result(1)
    row = SimpleNamespace(
        _mapping={
            "id": 7,
            "name": "warehouse",
            "source_type": "postgresql",
            "description": "主仓",
            "connection_config": {"host": "db.local"},
            "extra_config": {"ssl": True},
            "is_active": True,
            "connection_status": ConnectionStatus.CONNECTED.value,
            "created_by": "alice",
            "created_at": datetime(2026, 1, 1),
            "updated_at": datetime(2026, 1, 2),
        }
    )
    engine, _ = _make_engine_with_connection(count_result, [row])
    handler = ListDatasourcesHandler(engine=engine)

    result = handler.handle(
        ListDatasourcesQuery(source_type="postgresql", is_active=True, search="ware", page=2, page_size=10)
    )

    assert result["total"] == 1
    assert result["page"] == 2
    assert result["total_pages"] == 1
    assert result["items"][0].name == "warehouse"


def test_preview_table_data_handler_covers_not_found_success_schema_fallback_and_exception(monkeypatch):
    repository = MagicMock()
    repository.find_by_id.return_value = None
    handler = PreviewTableDataHandler(datasource_repository=repository)
    query = PreviewTableDataQuery(datasource_id=1, database="dw", table="public.orders", limit=5)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(query)

    repository.find_by_id.return_value = _make_datasource()
    adapter = MagicMock()
    adapter.get_table_schema.return_value = {
        "columns": [{"name": "id", "comment": "主键"}],
    }
    adapter.execute_query.return_value = {
        "columns": [{"name": "id", "type": "bigint"}, "name"],
        "data": [{"id": 1, "name": "alice"}],
    }
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )

    result = handler.handle(query)
    assert result["row_count"] == 1
    assert result["columns"][0]["comment"] == "主键"
    assert result["columns"][1]["type"] == "unknown"
    adapter.execute_query.assert_called_once_with('SELECT * FROM "public"."orders" LIMIT 5', limit=5)
    adapter.close.assert_called_once()

    adapter = MagicMock()
    adapter.get_table_schema.side_effect = RuntimeError("schema failed")
    adapter.execute_query.return_value = {"columns": ["id"], "data": [{"id": 1}]}
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    assert handler.handle(PreviewTableDataQuery(datasource_id=1, database="dw", table="orders", limit=3))["columns"][0]["comment"] == ""
    adapter.execute_query.assert_called_once_with('SELECT * FROM "orders" LIMIT 3', limit=3)
    adapter.close.assert_called_once()

    adapter = MagicMock()
    adapter.get_table_schema.return_value = {"columns": []}
    adapter.execute_query.side_effect = RuntimeError("query failed")
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )

    with pytest.raises(ApplicationException, match="预览表数据失败"):
        handler.handle(PreviewTableDataQuery(datasource_id=1, database="dw", table="orders", limit=1))

    adapter.close.assert_called_once()

    repository.find_by_id.return_value = _make_datasource(source_type="maxcompute")
    adapter = SimpleNamespace(
        get_table_schema=lambda *_args, **_kwargs: {"columns": [{"name": "id", "comment": "主键"}]},
        preview_table=lambda table, limit: {
            "columns": [{"name": "id", "type": "bigint"}, "name"],
            "rows": [{"id": 1, "name": "alice"}],
        },
        close=MagicMock(),
    )
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    result = handler.handle(PreviewTableDataQuery(datasource_id=1, database="dw", table="mc_orders", limit=2))
    assert result["columns"][0]["comment"] == "主键"
    assert result["columns"][1]["type"] == "unknown"
    assert result["data"] == [{"id": 1, "name": "alice"}]
    adapter.close.assert_called_once()

    repository.find_by_id.return_value = _make_datasource(source_type="maxcompute")
    adapter = SimpleNamespace(
        get_table_schema=lambda *_args, **_kwargs: {"columns": []},
        execute_query=MagicMock(return_value={"columns": ["id"], "rows": [{"id": 1}]}),
        close=MagicMock(),
    )
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    handler.handle(PreviewTableDataQuery(datasource_id=1, database="dw", table="mc_orders", limit=2))
    adapter.execute_query.assert_called_once_with("SELECT * FROM mc_orders LIMIT 2", limit=2)

    repository.find_by_id.return_value = _make_datasource(source_type="mysql")
    adapter = SimpleNamespace(
        get_table_schema=lambda *_args, **_kwargs: {"columns": []},
        execute_query=MagicMock(return_value={"columns": [], "data": []}),
        close=MagicMock(),
    )
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    handler.handle(PreviewTableDataQuery(datasource_id=1, database="dw", table="ods.orders", limit=2))
    adapter.execute_query.assert_called_once_with("SELECT * FROM `ods`.`orders` LIMIT 2", limit=2)

    adapter = SimpleNamespace(
        get_table_schema=lambda *_args, **_kwargs: {"columns": []},
        execute_query=MagicMock(return_value={"columns": [], "data": []}),
        close=MagicMock(),
    )
    monkeypatch.setattr(
        "app.application.datasource.handlers.preview_table_data_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    handler.handle(PreviewTableDataQuery(datasource_id=1, database="dw", table="orders", limit=2))
    adapter.execute_query.assert_called_once_with("SELECT * FROM `orders` LIMIT 2", limit=2)


def test_test_connection_handler_covers_not_found_success_failure_and_exception(monkeypatch):
    repository = MagicMock()
    repository.find_by_id.return_value = None
    handler = DatasourceTestConnectionHandler(repository=repository)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(DatasourceTestConnectionQuery(datasource_id=1))

    datasource = _make_datasource(source_type="maxcompute", connection_config={"access_key_id": "A", "access_key_secret": "B"})
    repository.find_by_id.return_value = datasource
    adapter = MagicMock()
    adapter.test_connection.return_value = {"success": True, "message": "ok", "details": {"latency": 1}}
    monkeypatch.setattr(
        "app.application.datasource.handlers.test_connection_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )

    result = handler.handle(DatasourceTestConnectionQuery(datasource_id=1))
    assert result["success"] is True
    assert datasource.connection_status == ConnectionStatus.CONNECTED.value
    repository.save.assert_called_with(datasource)

    adapter.test_connection.return_value = {"success": False, "message": "denied", "details": None}
    result = handler.handle(DatasourceTestConnectionQuery(datasource_id=1))
    assert result["success"] is False
    assert datasource.connection_status == ConnectionStatus.ERROR.value
    assert datasource.last_test_error == "denied"

    monkeypatch.setattr(
        "app.application.datasource.handlers.test_connection_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    result = handler.handle(DatasourceTestConnectionQuery(datasource_id=1))
    assert result["success"] is False
    assert "连接测试失败: boom" == result["message"]


def test_update_datasource_handler_covers_not_found_name_conflict_and_success():
    repository = MagicMock()
    repository.find_by_id.return_value = None
    repository.save.side_effect = lambda datasource: datasource
    handler = UpdateDatasourceHandler(repository=repository)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(UpdateDatasourceCommand(datasource_id=1))

    datasource = _make_datasource(
        source_type="maxcompute",
        connection_config={"host": "old", "database": "dw"},
        extra_config={"region": "cn"},
    )
    repository.find_by_id.return_value = datasource
    repository.exists_by_name.return_value = True

    with pytest.raises(ApplicationException, match="数据源名称 'new-name' 已存在"):
        handler.handle(UpdateDatasourceCommand(datasource_id=1, name="new-name"))

    repository.exists_by_name.return_value = False
    updated = handler.handle(
        UpdateDatasourceCommand(
            datasource_id=1,
            name="new-name",
            description="新描述",
            is_active=False,
            connection_config={"access_key_id": "AKID", "access_key_secret": "SECRET"},
            extra_config={"region": "us"},
        )
    )

    assert updated is datasource
    assert datasource.name == "new-name"
    assert datasource.description == "新描述"
    assert datasource.is_active is False
    assert datasource.connection_config == {
        "host": "old",
        "database": "dw",
        "access_id": "AKID",
        "access_key": "SECRET",
    }
    assert datasource.extra_config == {"region": "us"}
    assert datasource.connection_status == ConnectionStatus.UNKNOWN.value
    repository.save.assert_called_once_with(datasource)
