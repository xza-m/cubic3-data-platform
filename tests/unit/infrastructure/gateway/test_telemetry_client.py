from __future__ import annotations

from app.infrastructure.gateway.telemetry_client import GatewayTelemetryClient, normalize_gateway_summary


def test_normalize_gateway_summary_keeps_runtime_metrics():
    summary = normalize_gateway_summary(
        {
            "query_count": 4,
            "success_count": 3,
            "failed_count": 1,
            "queued_count": 2,
            "running_count": 1,
            "pending_count": 3,
            "avg_queue_wait_ms": 12.5,
            "max_current_queue_wait_ms": 50,
            "avg_execute_ms": 120,
            "remote_timeout_count": 1,
            "client_wait_timeout_count": 2,
            "timeout_count": 3,
            "rejected_count": 4,
            "result_object_count": 5,
            "spool_result_count": 6,
            "generated_at": "2026-05-29T10:00:00Z",
        }
    )

    assert summary["queued_count"] == 2
    assert summary["running_count"] == 1
    assert summary["pending_count"] == 3
    assert summary["avg_queue_wait_ms"] == 12.5
    assert summary["timeout_count"] == 3
    assert summary["spool_object_count"] == 6
    assert summary["generated_at"] == "2026-05-29T10:00:00Z"


def test_gateway_telemetry_client_normalizes_summary_response(monkeypatch):
    class _Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "success": True,
                "data": {
                    "query_count": 2,
                    "success_count": 1,
                    "queued_count": 1,
                    "spool_result_count": 7,
                },
            }

    calls = []

    def fake_get(url, *, params=None, headers=None, timeout=None):
        calls.append((url, params, headers, timeout))
        return _Response()

    monkeypatch.setattr("app.infrastructure.gateway.telemetry_client.requests.get", fake_get)
    client = GatewayTelemetryClient(
        base_url="http://dw-query-gateway:8000",
        platform_service_token="platform-secret",
        timeout_seconds=3,
    )

    summary = client.get_summary()

    assert summary["queued_count"] == 1
    assert summary["spool_object_count"] == 7
    assert summary["stability"] == 50
    assert calls[0][0] == "http://dw-query-gateway:8000/api/v1/telemetry/gateway/summary"
