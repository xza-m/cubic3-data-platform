from app.application.extraction.queries.get_task import GetTaskQuery
from app.application.extraction.queries.list_runs import ListRunsQuery


def test_get_task_query_defaults_include_stats_to_false():
    query = GetTaskQuery(task_id=7)

    assert query.task_id == 7
    assert query.include_stats is False


def test_list_runs_query_to_filters_ignores_none_and_keeps_explicit_values():
    query = ListRunsQuery(task_id=8, status="success", triggered_by="tester", page=3, page_size=50)

    assert query.to_filters() == {
        "task_id": 8,
        "status": "success",
        "triggered_by": "tester",
    }
    assert ListRunsQuery().to_filters() == {}
