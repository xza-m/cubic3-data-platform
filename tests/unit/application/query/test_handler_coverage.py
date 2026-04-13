"""
基础查询应用层 Handler 覆盖测试
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.application.query.commands.create_query import CreateQueryCommand
from app.application.query.commands.execute_query import ExecuteQueryCommand
from app.application.query.commands.execute_sql_preview import ExecuteSQLPreviewCommand
from app.application.query.commands.update_query import UpdateQueryCommand
from app.application.query.handlers.create_query_handler import CreateQueryHandler
from app.application.query.handlers.execute_query_handler import ExecuteQueryHandler
from app.application.query.handlers.execute_sql_preview_handler import ExecuteSQLPreviewHandler
from app.application.query.handlers.query_list_handlers import (
    CreateFolderHandler,
    DeleteQueryHandler,
    GetQueryHandler,
    GetStatisticsHandler,
    ListFoldersHandler,
    ListHistoriesHandler,
    ListQueriesHandler,
    ToggleFavoriteHandler,
)
from app.application.query.handlers.sql_query_async_handlers import (
    GetQueryResultHandler,
    GetQueryStatusHandler,
    SubmitAsyncQueryHandler,
)
from app.application.query.handlers.template_handlers import (
    CreateTemplateHandler,
    DeleteTemplateHandler,
    GetTemplateHandler,
    ListTemplatesHandler,
    UpdateTemplateHandler,
    UseTemplateHandler,
)
from app.application.query.handlers.update_query_handler import UpdateQueryHandler
from app.domain.entities.query import Query
from app.domain.entities.query_folder import QueryFolder
from app.domain.entities.query_history import QueryHistory
from app.domain.entities.query_template import QueryTemplate
from app.domain.entities.sql_query import SQLQuery, SQLQueryStatus
from app.shared.exceptions import ApplicationException, EntityNotFoundError, ValidationError


def _make_query(**overrides) -> Query:
    payload = {
        "id": 1,
        "query_code": "q_orders",
        "query_name": "订单查询",
        "source_id": 1,
        "sql_query": "SELECT * FROM orders",
        "description": "订单明细",
        "folder_id": 10,
        "tags": ["daily"],
        "is_favorite": False,
        "execute_count": 0,
        "created_by": "alice",
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
        "last_executed_at": datetime(2026, 1, 3, tzinfo=timezone.utc),
    }
    payload.update(overrides)
    return Query(**payload)


def test_create_query_handler_covers_generate_code_duplicate_and_success(monkeypatch):
    repository = MagicMock()
    handler = CreateQueryHandler(query_repository=repository)
    repository.find_by_code.return_value = None
    repository.save.side_effect = lambda query: query
    monkeypatch.setattr(
        "app.application.query.handlers.create_query_handler.uuid.uuid4",
        lambda: SimpleNamespace(hex="1234567890abcdef"),
    )

    created = handler.handle(
        CreateQueryCommand(
            query_name="订单查询",
            source_id=1,
            sql_query="SELECT * FROM orders",
            created_by="alice",
            query_code=None,
        )
    )
    assert created.query_code == "query_1234567890ab"

    repository.find_by_code.return_value = _make_query()
    with pytest.raises(ValidationError, match="查询编码已存在"):
        handler.handle(
            CreateQueryCommand(
                query_name="重复编码",
                source_id=1,
                sql_query="SELECT 1",
                created_by="alice",
                query_code="query_1234567890ab",
            )
        )


def test_execute_query_handler_covers_validation_limit_success_and_failure(monkeypatch):
    query_repository = MagicMock()
    datasource_repository = MagicMock()
    datasource_repository.find_by_id.return_value = SimpleNamespace(
        source_type="postgresql",
        connection_config={"host": "db.local"},
    )
    handler = ExecuteQueryHandler(
        query_repository=query_repository,
        datasource_repository=datasource_repository,
    )

    monkeypatch.setattr(
        "app.application.query.handlers.execute_query_handler.validate_sql_safety",
        lambda sql: (False, ["禁止写操作"]),
    )
    with pytest.raises(ValidationError, match="SQL 校验失败"):
        handler.handle(ExecuteQueryCommand(source_id=1, sql_query="DELETE FROM orders"))

    monkeypatch.setattr(
        "app.application.query.handlers.execute_query_handler.validate_sql_safety",
        lambda sql: (True, []),
    )
    adapter = MagicMock()
    adapter.execute_query.return_value = {"columns": ["id"], "data": [{"id": 1}]}
    monkeypatch.setattr(
        "app.application.query.handlers.execute_query_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    times = iter([100.0, 100.25, 200.0, 200.1])
    monkeypatch.setattr("app.application.query.handlers.execute_query_handler.time.time", lambda: next(times))
    query_repository.find_by_id.return_value = _make_query()

    result = handler.handle(
        ExecuteQueryCommand(source_id=1, sql_query="SELECT * FROM orders;", query_id=1, limit=50, executed_by="alice")
    )
    assert result["row_count"] == 1
    assert result["status"] == "success"
    adapter.execute_query.assert_called_once_with("SELECT * FROM orders LIMIT 50", limit=50)
    query_repository.save_history.assert_called_once()
    query_repository.save.assert_called_once()
    assert handler._add_limit_if_needed("SELECT * FROM orders LIMIT 10", 50) == "SELECT * FROM orders LIMIT 10"

    adapter.reset_mock()
    query_repository.reset_mock()
    adapter.execute_query.side_effect = RuntimeError("db timeout")
    with pytest.raises(ApplicationException, match="SQL 执行失败: db timeout"):
        handler.handle(ExecuteQueryCommand(source_id=1, sql_query="SELECT * FROM orders", limit=20))
    saved_history = query_repository.save_history.call_args.args[0]
    assert saved_history.status == "failed"
    assert saved_history.error_message == "db timeout"

    datasource_repository.find_by_id.return_value = None
    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(ExecuteQueryCommand(source_id=99, sql_query="SELECT 1"))


def test_execute_query_handler_normalizes_rows_payload_from_warehouse_adapters(monkeypatch):
    query_repository = MagicMock()
    datasource_repository = MagicMock()
    datasource_repository.find_by_id.return_value = SimpleNamespace(
        source_type="maxcompute",
        connection_config={"project": "dw"},
    )
    handler = ExecuteQueryHandler(
        query_repository=query_repository,
        datasource_repository=datasource_repository,
    )

    monkeypatch.setattr(
        "app.application.query.handlers.execute_query_handler.validate_sql_safety",
        lambda sql: (True, []),
    )
    adapter = MagicMock()
    adapter.execute_query.return_value = {
        "columns": [
            {"name": "subject_id", "type": "bigint"},
            {"name": "subject_name", "type": "string"},
        ],
        "rows": [
            [1, "语文"],
            [2, "数学"],
        ],
        "row_count": 2,
        "execution_time_ms": 88,
    }
    monkeypatch.setattr(
        "app.application.query.handlers.execute_query_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    times = iter([500.0, 500.1])
    monkeypatch.setattr("app.application.query.handlers.execute_query_handler.time.time", lambda: next(times))

    result = handler.handle(
        ExecuteQueryCommand(source_id=1, sql_query="SELECT * FROM result_table", limit=100, executed_by="alice")
    )

    assert result["row_count"] == 2
    assert result["columns"] == [
        {"name": "subject_id", "type": "bigint"},
        {"name": "subject_name", "type": "string"},
    ]
    assert result["data"] == [
        {"subject_id": 1, "subject_name": "语文"},
        {"subject_id": 2, "subject_name": "数学"},
    ]

    saved_history = query_repository.save_history.call_args.args[0]
    assert saved_history.result_rows == 2


def test_execute_sql_preview_command_and_handler_cover_core_paths(monkeypatch):
    assert ExecuteSQLPreviewCommand(source_id=1, sql_query="SELECT 1", limit=-1).limit == 100
    assert ExecuteSQLPreviewCommand(source_id=1, sql_query="SELECT 1", limit=2000).limit == 1000
    with pytest.raises(ValueError, match="数据源ID不能为空"):
        ExecuteSQLPreviewCommand(source_id=0, sql_query="SELECT 1")
    with pytest.raises(ValueError, match="SQL查询不能为空"):
        ExecuteSQLPreviewCommand(source_id=1, sql_query="   ")

    datasource_repository = MagicMock()
    datasource_repository.find_by_id.return_value = None
    handler = ExecuteSQLPreviewHandler(datasource_repository=datasource_repository)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(ExecuteSQLPreviewCommand(source_id=1, sql_query="SELECT 1"))

    datasource_repository.find_by_id.return_value = SimpleNamespace(
        source_type="postgresql",
        connection_config={"host": "db.local"},
    )
    monkeypatch.setattr(
        "app.application.query.handlers.execute_sql_preview_handler.validate_sql_query",
        lambda sql: (False, ["禁止操作"]),
    )
    with pytest.raises(ValidationError, match="SQL 校验失败"):
        handler.handle(ExecuteSQLPreviewCommand(source_id=1, sql_query="DELETE FROM orders"))

    monkeypatch.setattr(
        "app.application.query.handlers.execute_sql_preview_handler.validate_sql_query",
        lambda sql: (True, []),
    )
    adapter = MagicMock()
    adapter.execute_query.return_value = {
        "columns": [{"name": "order_id", "type": "bigint"}, "amount"],
        "rows": [[1, 12.5]],
    }
    monkeypatch.setattr(
        "app.application.query.handlers.execute_sql_preview_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    monkeypatch.setattr(
        "app.application.query.handlers.execute_sql_preview_handler.FieldIdentifier.identify_fields_batch",
        lambda fields: fields,
    )
    monkeypatch.setattr(
        "app.application.query.handlers.execute_sql_preview_handler.FieldIdentifier.get_statistics",
        lambda fields: {"total": len(fields)},
    )
    times = iter([300.0, 300.12, 400.0, 400.08])
    monkeypatch.setattr("app.application.query.handlers.execute_sql_preview_handler.time.time", lambda: next(times))

    result = handler.handle(ExecuteSQLPreviewCommand(source_id=1, sql_query="SELECT * FROM orders;", limit=20))
    assert result["columns"] == ["order_id", "amount"]
    assert result["data"] == [{"order_id": 1, "amount": 12.5}]
    assert result["statistics"] == {"total": 2}
    assert handler._prepare_sql("SELECT * FROM orders;", 20) == "SELECT * FROM (\nSELECT * FROM orders\n) AS preview_query LIMIT 20"
    assert handler._convert_rows_to_data([[1]], ["id"]) == [{"id": 1}]
    assert handler._convert_rows_to_data([], ["id"]) == []

    adapter.execute_query.side_effect = RuntimeError("preview failed")
    with pytest.raises(ApplicationException, match="SQL 执行失败: preview failed"):
        handler.handle(ExecuteSQLPreviewCommand(source_id=1, sql_query="SELECT * FROM orders", limit=10))


def test_query_list_handlers_cover_success_and_not_found_paths():
    repository = MagicMock()
    long_sql = "SELECT " + "x" * 250
    repository.list_queries.return_value = {
        "items": [
            _make_query(sql_query=long_sql),
            _make_query(id=2, query_code="q_short", sql_query="SELECT 1", updated_at=None, last_executed_at=None),
        ],
        "total": 2,
        "page": 1,
        "page_size": 20,
        "total_pages": 1,
    }

    list_handler = ListQueriesHandler(repository)
    payload = list_handler.handle(page=1, page_size=20, folder_id=1, is_favorite=True, search="订单", created_by="alice")
    assert payload["items"][0]["sql_query"].endswith("...")
    assert payload["items"][1]["sql_query"] == "SELECT 1"

    get_handler = GetQueryHandler(repository)
    repository.find_by_id.return_value = _make_query()
    assert get_handler.handle(1)["query_code"] == "q_orders"
    repository.find_by_id.return_value = None
    with pytest.raises(EntityNotFoundError, match="查询不存在"):
        get_handler.handle(999)

    toggle_handler = ToggleFavoriteHandler(repository)
    repository.find_by_id.return_value = _make_query(is_favorite=False)
    assert toggle_handler.handle(1) == {"is_favorite": True}
    repository.find_by_id.return_value = None
    with pytest.raises(EntityNotFoundError):
        toggle_handler.handle(999)

    folder = QueryFolder(id=1, folder_name="默认", parent_id=None, created_by="alice", created_at=datetime(2026, 1, 1))
    repository.list_folders.return_value = [folder]
    assert ListFoldersHandler(repository).handle(created_by="alice")[0]["folder_name"] == "默认"
    repository.save_folder.side_effect = lambda entity: entity
    created_folder = CreateFolderHandler(repository).handle("报表", created_by="alice", parent_id=1)
    assert created_folder["folder_name"] == "报表"

    delete_handler = DeleteQueryHandler(repository)
    repository.delete.return_value = True
    assert delete_handler.handle(1) is None
    repository.delete.return_value = False
    with pytest.raises(EntityNotFoundError):
        delete_handler.handle(2)

    history1 = QueryHistory(
        id=1,
        query_id=1,
        source_id=1,
        sql_query="SELECT " + "y" * 250,
        status="success",
        result_rows=10,
        execution_time_ms=100,
        executed_by="alice",
        executed_at=datetime(2026, 1, 1),
    )
    history2 = QueryHistory(
        id=2,
        query_id=None,
        source_id=1,
        sql_query="SELECT 1",
        status="failed",
        result_rows=0,
        execution_time_ms=10,
        error_message="boom",
        executed_by="alice",
        executed_at=datetime(2026, 1, 2),
    )
    repository.list_histories.return_value = {
        "items": [history1, history2],
        "total": 2,
        "page": 1,
        "page_size": 20,
        "total_pages": 1,
    }
    histories = ListHistoriesHandler(repository).handle(page=1, page_size=20)
    assert histories["items"][0]["sql_query"].endswith("...")
    assert histories["items"][1]["sql_query"] == "SELECT 1"

    repository.get_statistics.return_value = {"total_queries": 5}
    assert GetStatisticsHandler(repository).handle(user_id="alice") == {"total_queries": 5}


def test_sql_query_async_handlers_cover_submit_update_fail_and_lookup():
    repository = MagicMock()
    repository.save.side_effect = lambda entity: entity
    submit_handler = SubmitAsyncQueryHandler(repository)

    query = submit_handler.handle(source_id=1, sql="SELECT 1", limit=50, user_id="alice")
    assert query.status == SQLQueryStatus.PENDING
    assert query.limit_rows == 50

    submit_handler.update_job_id(query, "job-1")
    assert query.job_id == "job-1"
    submit_handler.mark_failed(query, "queue failed")
    assert query.status == SQLQueryStatus.FAILED
    assert repository.commit.call_count == 2

    repository.find_by_id.return_value = query
    status_payload = GetQueryStatusHandler(repository).handle(query_id=1)
    assert status_payload["status"] == SQLQueryStatus.FAILED
    assert GetQueryResultHandler(repository).handle(query_id=1) is query
    repository.find_by_id.return_value = None
    assert GetQueryStatusHandler(repository).handle(query_id=2) is None


def test_template_handlers_cover_validation_success_and_not_found_paths():
    repository = MagicMock()
    list_handler = ListTemplatesHandler(repository)
    template = QueryTemplate(
        id=1,
        template_name="日活模板",
        template_description="描述",
        sql_template="SELECT * FROM orders WHERE ds='{{ds}}'",
        parameters=[{"name": "ds"}],
        category="运营",
        tags=["daily"],
        use_count=1,
        created_by="alice",
        created_at=datetime(2026, 1, 1),
    )
    repository.find_all.return_value = {"items": [template], "total": 1}
    payload = list_handler.handle(page=2, per_page=5, category="运营", search="活跃")
    assert payload["items"][0]["template_name"] == "日活模板"
    assert payload["page_size"] == 5

    create_handler = CreateTemplateHandler(repository)
    with pytest.raises(ValidationError, match="模板名称不能为空"):
        create_handler.handle("", "SELECT 1", created_by="alice")
    with pytest.raises(ValidationError, match="SQL模板不能为空"):
        create_handler.handle("模板", "", created_by="alice")
    repository.save.side_effect = lambda entity: entity
    created = create_handler.handle("模板", "SELECT 1", created_by="alice", tags=["daily"])
    assert created["template_name"] == "模板"

    get_handler = GetTemplateHandler(repository)
    repository.find_by_id.return_value = template
    assert get_handler.handle(1)["id"] == 1
    repository.find_by_id.return_value = None
    with pytest.raises(EntityNotFoundError, match="模板不存在"):
        get_handler.handle(9)

    update_handler = UpdateTemplateHandler(repository)
    repository.find_by_id.return_value = template
    updated = update_handler.handle(1, updated_by="alice", template_name="新模板", sql_template="SELECT 2")
    assert updated["template_name"] == "新模板"
    assert template.sql_template == "SELECT 2"
    repository.find_by_id.return_value = None
    with pytest.raises(EntityNotFoundError):
        update_handler.handle(2, updated_by="alice")

    delete_handler = DeleteTemplateHandler(repository)
    repository.find_by_id.return_value = template
    assert delete_handler.handle(1, deleted_by="alice") is None
    repository.find_by_id.return_value = None
    with pytest.raises(EntityNotFoundError):
        delete_handler.handle(2, deleted_by="alice")

    use_handler = UseTemplateHandler(repository)
    template.sql_template = "SELECT * FROM orders WHERE ds='{{ds}}'"
    template.use_count = 0
    repository.find_by_id.return_value = template
    used = use_handler.handle(1, params={"ds": "2026-01-01"})
    assert used["sql_query"] == "SELECT * FROM orders WHERE ds='2026-01-01'"
    assert template.use_count == 1
    repository.find_by_id.return_value = None
    with pytest.raises(EntityNotFoundError):
        use_handler.handle(2)


def test_update_query_handler_covers_not_found_and_success():
    repository = MagicMock()
    repository.find_by_id.return_value = None
    repository.save.side_effect = lambda query: query
    handler = UpdateQueryHandler(query_repository=repository)

    with pytest.raises(EntityNotFoundError, match="查询不存在"):
        handler.handle(UpdateQueryCommand(query_id=1))

    query = _make_query()
    repository.find_by_id.return_value = query
    updated = handler.handle(
        UpdateQueryCommand(
            query_id=1,
            query_name="订单宽表",
            sql_query="SELECT order_id FROM orders",
            description="新描述",
            folder_id=11,
            tags=["report"],
            source_id=2,
        )
    )
    assert updated is query
    assert query.query_name == "订单宽表"
    assert query.sql_query == "SELECT order_id FROM orders"
    assert query.description == "新描述"
    assert query.folder_id == 11
    assert query.tags == ["report"]
    assert query.source_id == 2
    repository.save.assert_called_once_with(query)
