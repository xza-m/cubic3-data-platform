from __future__ import annotations

from app.infrastructure.seed import seed_access_governance_defaults
from tests.conftest import _make_jwt


def test_query_execute_uses_gateway_access_context_when_policy_allows(app, monkeypatch):
    app.config["QUERY_GATEWAY_BASE_URL"] = "http://dw-query-gateway:8000"
    app.config["QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN"] = "platform-secret"
    calls = []

    with app.app_context():
        seed_access_governance_defaults()

    class StubGatewayQueryClient:
        def __init__(self, *, base_url: str, platform_service_token: str, timeout_seconds: int = 5):
            calls.append(("init", base_url, platform_service_token, timeout_seconds))

        def execute_sql(self, *, sql: str, access_context: dict, wait_for_completion: bool):
            calls.append(("execute", sql, access_context, wait_for_completion))
            return {
                "query_id": "qry-gateway",
                "status": "QUEUED",
                "completed": False,
                "poll_url": "/api/v1/queries/qry-gateway",
            }

    monkeypatch.setattr("app.interfaces.api.v1.queries.GatewayQueryClient", StubGatewayQueryClient)
    token = _make_jwt(
        user_id="principal:feishu:t1:on_m1_user",
        user_name="M1 User",
        roles=["viewer", "data_m1_reader"],
    )

    response = app.test_client().post(
        "/api/v1/queries/execute",
        json={"source_id": 1, "sql_query": "SELECT count(*) FROM dw.dws_course_daily", "limit": 1000},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["gateway_query_id"] == "qry-gateway"
    assert payload["status"] == "QUEUED"
    access_context = calls[1][2]
    assert access_context["schema"] == "GatewayAccessContext.v1"
    assert access_context["principal_id"] == "principal:feishu:t1:on_m1_user"
    assert access_context["execution_profile_code"] == "mc_m1_reader"
    assert access_context["resource_set_physical"][0]["table"] == "dws_course_daily"


def test_query_execute_blocks_gateway_when_data_policy_denies(app, monkeypatch):
    app.config["QUERY_GATEWAY_BASE_URL"] = "http://dw-query-gateway:8000"
    app.config["QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN"] = "platform-secret"
    with app.app_context():
        seed_access_governance_defaults()

    class StubGatewayQueryClient:
        def __init__(self, **_kwargs):
            raise AssertionError("policy denied queries must not call gateway")

    monkeypatch.setattr("app.interfaces.api.v1.queries.GatewayQueryClient", StubGatewayQueryClient)
    token = _make_jwt(
        user_id="principal:feishu:t1:on_basic_user",
        user_name="Basic User",
        roles=["viewer", "data_m0_reader"],
    )

    response = app.test_client().post(
        "/api/v1/queries/execute",
        json={"source_id": 1, "sql_query": "SELECT count(*) FROM dw.dws_course_daily", "limit": 1000},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.get_json()["data"]["policy_decision"]["reason_code"] == "data_policy_not_matched"
