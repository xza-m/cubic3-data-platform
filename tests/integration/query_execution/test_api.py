def test_query_execution_api_submit_status_events_and_cancel(client):
    created = client.post(
        "/api/v1/query-execution/jobs",
        json={
            "source_id": 1,
            "sql_query": "SELECT 1",
            "route_type": "manual_sql",
            "idempotency_key": "api-key-1",
        },
    )
    assert created.status_code == 201
    payload = created.get_json()["data"]
    query_id = payload["query_id"]
    assert payload["status"] == "QUEUED"

    status = client.get(f"/api/v1/query-execution/jobs/{query_id}")
    assert status.status_code == 200
    assert status.get_json()["data"]["id"] == query_id

    events = client.get(f"/api/v1/query-execution/jobs/{query_id}/events")
    assert events.status_code == 200
    assert events.get_json()["data"]["items"][0]["event_type"] == "job_created"

    canceled = client.post(f"/api/v1/query-execution/jobs/{query_id}/cancel")
    assert canceled.status_code == 200
    assert canceled.get_json()["data"]["status"] == "CANCELED"
