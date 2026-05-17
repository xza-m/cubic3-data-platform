from __future__ import annotations

from tests.conftest import install_default_admin_auth


def test_gateway_observability_api_proxies_gateway_telemetry(app, monkeypatch):
    app.config["QUERY_GATEWAY_BASE_URL"] = "http://dw-query-gateway:8000"
    app.config["QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN"] = "platform-secret"
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))
    calls = []

    class StubGatewayClient:
        def __init__(self, *, base_url: str, platform_service_token: str, timeout_seconds: int = 5):
            calls.append(("init", base_url, platform_service_token, timeout_seconds))

        def get_summary(self):
            calls.append(("summary",))
            return {
                "query_count": 3,
                "success_count": 2,
                "failed_count": 1,
                "physical_denied_count": 1,
                "stability": 66.67,
                "by_data_level": {"M0": 1, "M1": 2},
            }

        def list_query_runs(self, *, limit: int = 50):
            calls.append(("runs", limit))
            return {
                "items": [
                    {
                        "query_id": "qry-001",
                        "trace_id": "tr-001",
                        "principal_id": "principal:feishu:t1:on_user",
                        "data_level": "M1",
                        "execution_profile_code": "mc_m1_reader",
                        "credential_ref": "C3_MC_M1_READER",
                        "status": "SUCCEEDED",
                        "physical_denied": False,
                    }
                ]
            }

    monkeypatch.setattr("app.interfaces.api.v1.governance.GatewayTelemetryClient", StubGatewayClient)

    summary = client.get("/api/v1/governance/gateway/summary")
    runs = client.get("/api/v1/governance/gateway/query-runs?limit=10")

    assert summary.status_code == 200
    assert summary.get_json()["data"]["query_count"] == 3
    assert runs.status_code == 200
    assert runs.get_json()["data"]["items"][0]["trace_id"] == "tr-001"
    assert calls == [
        ("init", "http://dw-query-gateway:8000", "platform-secret", 5),
        ("summary",),
        ("init", "http://dw-query-gateway:8000", "platform-secret", 5),
        ("runs", 10),
    ]
