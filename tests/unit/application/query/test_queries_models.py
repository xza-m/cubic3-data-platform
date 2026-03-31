"""
基础查询 Query 模型测试
"""
from app.application.query.queries import (
    GetQueryQuery,
    GetStatisticsQuery,
    ListFoldersQuery,
    ListHistoriesQuery,
    ListQueriesQuery,
    ListTemplatesQuery,
)


def test_query_dataclasses_can_be_constructed():
    list_queries = ListQueriesQuery(page=2, page_size=50, folder_id=1, is_favorite=True, search="订单", created_by="alice")
    get_query = GetQueryQuery(query_id=7)
    list_folders = ListFoldersQuery(created_by="alice")
    list_histories = ListHistoriesQuery(
        page=3,
        page_size=30,
        query_id=7,
        source_id=1,
        status="success",
        executed_by="alice",
        date_from="2026-01-01",
        date_to="2026-01-31",
    )
    list_templates = ListTemplatesQuery(page=4, page_size=15, category="运营", search="活跃")
    statistics = GetStatisticsQuery(user_id="alice")

    assert list_queries.page == 2
    assert get_query.query_id == 7
    assert list_folders.created_by == "alice"
    assert list_histories.status == "success"
    assert list_templates.category == "运营"
    assert statistics.user_id == "alice"
