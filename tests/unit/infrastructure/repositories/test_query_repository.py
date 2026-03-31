"""
查询仓储测试
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from sqlalchemy.orm import Session

from app.domain.entities.query import Query
from app.domain.entities.query_folder import QueryFolder
from app.domain.entities.query_history import QueryHistory
from app.infrastructure.repositories.query_repository import QueryRepository


def _make_repo():
    session = MagicMock(spec=Session)
    return QueryRepository(session=session), session


def _make_query_entity(**overrides):
    payload = {
        "id": 1,
        "query_code": "q_orders",
        "query_name": "订单查询",
        "source_id": 1,
        "sql_query": "SELECT * FROM orders",
        "description": "订单明细",
        "folder_id": 10,
        "tags": ["daily"],
        "created_by": "alice",
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
        "is_deleted": False,
    }
    payload.update(overrides)
    return Query(**payload)


def test_save_and_find_methods_use_session_chain():
    repo, session = _make_repo()
    entity = _make_query_entity()
    session.query.return_value.filter_by.return_value.first.return_value = entity

    assert repo.save(entity) is entity
    session.add.assert_called_once_with(entity)
    session.commit.assert_called_once()
    session.refresh.assert_called_once_with(entity)

    assert repo.find_by_id(1) is entity
    assert repo.find_by_code("q_orders") is entity


def test_list_queries_applies_filters_search_and_pagination():
    repo, session = _make_repo()
    query_obj = MagicMock()
    query_obj.filter_by.return_value = query_obj
    query_obj.filter.return_value = query_obj
    query_obj.order_by.return_value = query_obj
    query_obj.offset.return_value = query_obj
    query_obj.limit.return_value = query_obj
    query_obj.count.return_value = 3
    query_obj.all.return_value = [_make_query_entity()]
    session.query.return_value = query_obj

    result = repo.list_queries(
        page=2,
        page_size=5,
        filters={
            "folder_id": 10,
            "is_favorite": True,
            "created_by": "alice",
            "search": "orders",
        },
    )

    assert result["total"] == 3
    assert result["page"] == 2
    assert result["total_pages"] == 1
    assert result["items"][0].query_code == "q_orders"
    assert query_obj.filter.called
    assert query_obj.offset.call_args.args[0] == 5
    assert query_obj.limit.call_args.args[0] == 5


def test_delete_covers_found_and_not_found():
    repo, session = _make_repo()
    entity = _make_query_entity()
    repo.find_by_id = MagicMock(side_effect=[entity, None])

    assert repo.delete(1) is True
    assert entity.is_deleted is True
    assert session.commit.call_count == 1

    assert repo.delete(2) is False
    assert session.commit.call_count == 1


def test_folder_and_history_persistence_paths():
    repo, session = _make_repo()

    folder = QueryFolder(id=1, folder_name="默认", created_by="alice")
    folder_query = MagicMock()
    folder_query.filter_by.return_value = folder_query
    folder_query.order_by.return_value = folder_query
    folder_query.all.return_value = [folder]
    session.query.return_value = folder_query

    assert repo.save_folder(folder) is folder
    session.add.assert_called_with(folder)
    session.commit.assert_called()
    session.refresh.assert_called_with(folder)
    assert repo.list_folders(created_by="alice") == [folder]

    history = QueryHistory(
        id=1,
        query_id=1,
        source_id=1,
        sql_query="SELECT 1",
        status="success",
        result_rows=1,
        execution_time_ms=12,
        executed_by="alice",
    )
    assert repo.save_history(history) is history
    session.add.assert_called_with(history)


def test_list_histories_covers_valid_and_invalid_dates():
    repo, session = _make_repo()
    history_query = MagicMock()
    history_query.filter_by.return_value = history_query
    history_query.filter.return_value = history_query
    history_query.order_by.return_value = history_query
    history_query.offset.return_value = history_query
    history_query.limit.return_value = history_query
    history_query.count.return_value = 2
    history_query.all.return_value = [
        QueryHistory(
            id=1,
            query_id=1,
            source_id=1,
            sql_query="SELECT 1",
            status="success",
            result_rows=1,
            execution_time_ms=10,
            executed_by="alice",
            executed_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
    ]
    session.query.return_value = history_query

    result = repo.list_histories(
        page=1,
        page_size=20,
        filters={
            "query_id": 1,
            "source_id": 1,
            "status": "success",
            "executed_by": "alice",
            "date_from": "2026-01-01T00:00:00+00:00",
            "date_to": "bad-date",
        },
    )

    assert result["total"] == 2
    assert result["items"][0].status == "success"
    assert history_query.filter.called


def test_list_histories_covers_invalid_date_from_and_valid_date_to():
    repo, session = _make_repo()
    history_query = MagicMock()
    history_query.filter_by.return_value = history_query
    history_query.filter.return_value = history_query
    history_query.order_by.return_value = history_query
    history_query.offset.return_value = history_query
    history_query.limit.return_value = history_query
    history_query.count.return_value = 0
    history_query.all.return_value = []
    session.query.return_value = history_query

    result = repo.list_histories(
        page=1,
        page_size=20,
        filters={
            "date_from": "bad-date",
            "date_to": "2026-01-31T00:00:00+00:00",
        },
    )

    assert result["total"] == 0
    assert result["items"] == []
    assert history_query.filter.called


def test_get_statistics_covers_user_filter_and_zero_defaults():
    repo, session = _make_repo()
    week_query = MagicMock()
    week_query.filter.return_value = week_query
    week_query.scalar.return_value = 5
    saved_query = MagicMock()
    saved_query.filter_by.return_value = saved_query
    saved_query.scalar.return_value = 2
    avg_query = MagicMock()
    avg_query.filter.return_value = avg_query
    avg_query.scalar.return_value = 120.9
    session.query.side_effect = [week_query, saved_query, avg_query]

    result = repo.get_statistics(user_id="alice")
    assert result == {
        "query_count_week": 5,
        "saved_queries_count": 2,
        "avg_execution_time_ms": 120,
    }

    repo, session = _make_repo()
    week_query = MagicMock()
    week_query.filter.return_value = week_query
    week_query.scalar.return_value = None
    saved_query = MagicMock()
    saved_query.filter_by.return_value = saved_query
    saved_query.scalar.return_value = None
    avg_query = MagicMock()
    avg_query.filter.return_value = avg_query
    avg_query.scalar.return_value = None
    session.query.side_effect = [week_query, saved_query, avg_query]

    assert repo.get_statistics() == {
        "query_count_week": 0,
        "saved_queries_count": 0,
        "avg_execution_time_ms": 0,
    }
