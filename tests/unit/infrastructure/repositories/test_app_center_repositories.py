"""
app_center 相关仓储覆盖测试
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.infrastructure.repositories.app_execution_repository import AppExecutionRepository
from app.infrastructure.repositories.extraction_repository import ExtractionRepository
from app.infrastructure.repositories.feishu_chat_repository import FeishuChatRepository


def _session():
    return MagicMock(spec=Session)


def test_app_execution_repository_covers_crud_filters_and_stats():
    session = _session()
    repo = AppExecutionRepository(session)
    query = MagicMock()
    query.filter_by.return_value = query
    query.filter.return_value = query
    query.join.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.side_effect = [3, 2, 1, 4, 4]
    query.all.return_value = ["execution"]
    query.first.return_value = "execution-1"

    avg_query = MagicMock()
    avg_query.filter.return_value = avg_query
    avg_query.filter_by.return_value = avg_query
    avg_query.scalar.return_value = 123.4
    session.query.side_effect = [query, query, query, avg_query, query]

    entity = MagicMock()
    assert repo.save(entity) is entity
    assert repo.find_by_id(1) == "execution-1"

    items, total = repo.find_all(
        app_code="report_push",
        instance_id=2,
        status="success",
        trigger_type="scheduled",
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_date=datetime(2026, 1, 2, tzinfo=timezone.utc),
        page=2,
        page_size=5,
    )
    assert items == ["execution"]
    assert total == 3

    stats = repo.get_stats(
        instance_id=2,
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    assert stats == {
        "total_executions": 2,
        "success_count": 1,
        "failed_count": 4,
        "avg_duration_ms": 123.4,
    }

    by_instance, total = repo.find_by_instance(2, page=3, page_size=10)
    assert by_instance == ["execution"]
    assert total == 4
    repo.commit()

    query.offset.assert_called_with(20)
    query.limit.assert_called_with(10)


def test_extraction_repository_covers_crud_pagination_and_txn(monkeypatch):
    session = _session()
    repo = ExtractionRepository(session)
    logger = MagicMock()
    monkeypatch.setattr("app.infrastructure.repositories.extraction_repository.logger", logger)

    task_query = MagicMock()
    task_query.filter_by.return_value = task_query
    task_query.first.return_value = "task-1"

    run_query = MagicMock()
    run_query.filter_by.return_value = run_query
    run_query.order_by.return_value = run_query
    run_query.offset.return_value = run_query
    run_query.limit.return_value = run_query
    run_query.count.return_value = 2
    run_query.all.return_value = ["run-1"]
    run_query.first.return_value = "run-detail"

    pending_query = MagicMock()
    pending_query.filter_by.return_value = pending_query
    pending_query.limit.return_value = pending_query
    pending_query.all.return_value = ["pending-run"]

    session.query.side_effect = [
        task_query,   # find_by_id
        task_query,   # find_by_code
        task_query,   # delete
        run_query,    # find_run_by_id
        run_query,    # list_runs
        pending_query # find_pending_runs
    ]

    task = MagicMock()
    run = MagicMock()
    assert repo.save(task) is task
    assert repo.find_by_id(1) == "task-1"
    assert repo.find_by_code("extract_orders") == "task-1"
    assert repo.delete(1) is True
    assert repo.save_run(run) is run
    assert repo.find_run_by_id(2) == "run-detail"
    assert repo.list_runs(task_id=1, status="running", page=2, page_size=5) == {
        "items": ["run-1"],
        "total": 2,
    }
    assert repo.find_pending_runs(limit=3) == ["pending-run"]

    repo.commit()
    logger.debug.assert_called_with("Transaction committed")

    session.commit.side_effect = RuntimeError("boom")
    with pytest.raises(RuntimeError, match="boom"):
        repo.commit()
    session.rollback.assert_called_once()

    repo.rollback()
    assert session.rollback.call_count == 2


def test_extraction_repository_delete_returns_false_when_missing():
    session = _session()
    repo = ExtractionRepository(session)
    repo.find_by_id = MagicMock(return_value=None)

    assert repo.delete(404) is False
    session.delete.assert_not_called()


def test_feishu_chat_repository_covers_upsert_and_state_changes(monkeypatch):
    session = _session()
    repo = FeishuChatRepository(session)
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr("app.infrastructure.repositories.feishu_chat_repository.utcnow", MagicMock(return_value=now))

    existing = MagicMock(chat_name="旧群", added_via="sync")
    existing_query = MagicMock()
    existing_query.filter_by.return_value = existing_query
    existing_query.first.return_value = existing

    list_query = MagicMock()
    list_query.filter_by.return_value = list_query
    list_query.order_by.return_value = list_query
    list_query.all.return_value = [existing]
    list_query.first.return_value = existing

    missing_query = MagicMock()
    missing_query.filter_by.return_value = missing_query
    missing_query.first.return_value = None

    session.query.side_effect = [
        existing_query,  # upsert existing
        missing_query,   # upsert new
        existing_query,  # deactivate existing
        missing_query,   # deactivate missing
        list_query,      # find_active
        list_query,      # find_all
        list_query,      # find_by_chat_id
        existing_query,  # update_active existing
        missing_query,   # update_active missing
    ]

    updated = repo.upsert("oc_1", "新群名", "event")
    assert updated is existing
    assert existing.chat_name == "新群名"
    assert existing.active is True
    assert existing.added_via == "event"
    assert existing.last_seen_at == now

    created = repo.upsert("oc_2", "二号群", "sync")
    assert created.chat_id == "oc_2"
    assert created.chat_name == "二号群"
    session.add.assert_called_once()

    assert repo.deactivate("oc_1") is True
    assert repo.deactivate("missing") is False
    assert repo.find_active() == [existing]
    assert repo.find_all() == [existing]
    assert repo.find_by_chat_id("oc_1") is existing
    assert repo.update_active("oc_1", False) is existing
    assert existing.active is False
    assert repo.update_active("missing", True) is None
    repo.commit()

    assert session.commit.call_count >= 5
