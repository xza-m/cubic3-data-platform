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

        def get_observability_snapshot(self, *, window: str = "24h", bucket: str = "1h", query_run_limit: int = 200):
            calls.append(("observability", window, bucket, query_run_limit))
            return {
                "window": window,
                "bucket": bucket,
                "generated_at": "2026-05-29T10:00:00Z",
                "metric_version": "gateway-observability.v1",
                "source": "dw-query-gateway-postgres",
                "is_partial": False,
                "summary": {
                    "query_count": 3,
                    "success_count": 2,
                    "failed_count": 1,
                    "physical_denied_count": 1,
                    "stability": 66.67,
                    "by_data_level": {"M0": 1, "M1": 2},
                    "queued_count": 1,
                    "running_count": 2,
                    "pending_count": 3,
                    "avg_queue_wait_ms": 12.5,
                    "max_current_queue_wait_ms": 99,
                    "avg_execute_ms": 120,
                    "timeout_count": 1,
                    "rejected_count": 1,
                    "export_not_ready_count": 1,
                    "result_rejected_count": 2,
                    "auth_denied_count": 1,
                    "legacy_protocol_count": 1,
                    "worker_heartbeat_stale_count": 1,
                    "worker_orphan_lease_reclaimed_count": 1,
                    "gateway_readyz_degraded_count": 1,
                    "spool_object_count": 3,
                },
                "timeseries": {
                    "bucket": bucket,
                    "points": [
                        {
                            "bucket_start": "2026-05-29T09:00:00Z",
                            "query_total": 3,
                            "success": 2,
                            "failed": 1,
                            "rejected": 0,
                            "timeout": 1,
                            "success_rate": 66.67,
                        }
                    ],
                },
                "breakdowns": {"data_level": [{"key": "M1", "count": 2}, {"key": "missing", "count": 1}]},
                "contract_completeness": {
                    "total": 3,
                    "platform_governed_count": 2,
                    "gateway_only_count": 1,
                    "legacy_actor_count": 1,
                    "principal_present_rate": 66.67,
                    "actor_present_rate": 66.67,
                    "policy_decision_present_rate": 66.67,
                    "data_level_present_rate": 66.67,
                    "execution_profile_present_rate": 66.67,
                    "credential_ref_present_rate": 66.67,
                },
                "security": {"auth_denied_count": 1},
                "workers": {"live_worker_count": 1, "worker_capacity": 2},
                "query_runs": {
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
                    ],
                    "total": 1,
                },
            }

        def get_readiness(self):
            calls.append(("readyz",))
            return {
                "status": "healthy",
                "checks": {
                    "database": "ok",
                    "worker": "ok",
                    "spool": "ok",
                },
            }

    monkeypatch.setattr("app.interfaces.api.v1.governance.GatewayTelemetryClient", StubGatewayClient)

    observability = client.get("/api/v1/governance/gateway/observability?window=24h&bucket=1h&limit=100")

    assert observability.status_code == 200
    observability_payload = observability.get_json()["data"]
    assert observability_payload["metric_version"] == "gateway-observability.v1"
    assert observability_payload["summary"]["query_count"] == 3
    assert observability_payload["timeseries"]["points"][0]["query_total"] == 3
    assert observability_payload["contract_completeness"]["gateway_only_count"] == 1
    assert observability_payload["alerts"]["status"] == "critical"
    assert {item["code"] for item in observability_payload["alerts"]["alerts"]} >= {
        "gateway_stability_low",
        "gateway_pending_backlog",
        "gateway_queue_wait_high",
        "gateway_timeout_seen",
        "gateway_result_rejected_seen",
        "gateway_export_not_ready_seen",
        "gateway_auth_denied_seen",
        "gateway_legacy_protocol_seen",
        "gateway_worker_heartbeat_stale_seen",
        "gateway_worker_orphan_lease_reclaimed_seen",
        "gateway_readyz_degraded_seen",
    }
    assert observability_payload["query_runs"]["items"][0]["trace_id"] == "tr-001"
    assert calls == [
        ("init", "http://dw-query-gateway:8000", "platform-secret", 5),
        ("observability", "24h", "1h", 100),
        ("readyz",),
    ]
