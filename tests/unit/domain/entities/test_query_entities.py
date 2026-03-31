"""
查询相关实体测试
"""
from __future__ import annotations

from datetime import timedelta

from app.domain.entities.query import Query
from app.domain.entities.query_folder import QueryFolder
from app.domain.entities.query_history import QueryHistory
from app.domain.entities.query_template import QueryTemplate
from app.domain.entities.sql_query import SQLQuery, SQLQueryStatus


def test_query_entity_covers_execution_favorite_delete_events_and_repr():
    query = Query(
        id=1,
        query_code="q_orders",
        query_name="订单查询",
        source_id=1,
        sql_query="SELECT * FROM orders",
        created_by="alice",
        execute_count=0,
        is_favorite=False,
        is_deleted=False,
    )

    query.mark_executed()
    assert query.execute_count == 1
    assert query.last_executed_at is not None

    query.toggle_favorite()
    assert query.is_favorite is True

    query.soft_delete()
    assert query.is_deleted is True
    assert query.deleted_at is not None

    query.add_domain_event("created")
    query.add_domain_event("updated")
    assert query.get_domain_events() == ["created", "updated"]
    query.clear_domain_events()
    assert query.get_domain_events() == []
    assert repr(query) == "<Query id=1 code=q_orders name=订单查询>"


def test_query_folder_history_and_template_repr_and_methods():
    folder = QueryFolder(id=2, folder_name="默认", created_by="alice")
    history = QueryHistory(
        id=3,
        query_id=1,
        source_id=1,
        sql_query="SELECT * FROM orders",
        status="success",
        result_rows=10,
        execution_time_ms=120,
        executed_by="alice",
    )
    template = QueryTemplate(
        id=4,
        template_name="日活模板",
        sql_template="SELECT * FROM table WHERE ds='{{ds}}'",
        category="运营",
        created_by="alice",
        use_count=0,
    )

    template.increment_use_count()

    assert repr(folder) == "<QueryFolder id=2 name=默认>"
    assert repr(history) == "<QueryHistory id=3 status=success rows=10>"
    assert template.use_count == 1
    assert repr(template) == "<QueryTemplate id=4 name=日活模板 category=运营>"


def test_sql_query_entity_covers_lifecycle_serialization_and_repr():
    query = SQLQuery(
        id=5,
        source_id=1,
        sql="SELECT * FROM orders",
        limit_rows=100,
        status=SQLQueryStatus.PENDING,
        created_by="alice",
    )

    assert query.is_finished() is False
    assert query.is_successful() is False
    assert query.get_duration_seconds() == 0.0

    query.start()
    assert query.status == SQLQueryStatus.RUNNING
    assert query.started_at is not None

    query.mark_as_completed({"columns": ["id"], "data": [{"id": 1}]}, row_count=1, execution_time_ms=250)
    assert query.status == SQLQueryStatus.COMPLETED
    assert query.is_finished() is True
    assert query.is_successful() is True
    assert query.get_duration_seconds() == 0.25

    status_payload = query.to_status_dict()
    full_payload = query.to_dict(include_result=True)
    assert status_payload["status"] == SQLQueryStatus.COMPLETED
    assert full_payload["result"]["columns"] == ["id"]

    query.started_at = query.completed_at - timedelta(seconds=2)
    query.mark_as_failed("boom", "stack")
    assert query.status == SQLQueryStatus.FAILED
    assert query.error_message == "boom"
    assert query.error_stack == "stack"
    assert query.execution_time_ms >= 0
    assert query.to_dict(include_result=False)["error_message"] == "boom"
    assert repr(query) == "<SQLQuery id=5 status=failed>"
