from __future__ import annotations

import pytest

from app.infrastructure.gateway.telemetry_client import (
    GatewayQueryClient,
    GatewayQueryError,
    GatewayTelemetryClient,
    normalize_gateway_summary,
)


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


def test_normalize_gateway_summary_flattens_real_gateway_runtime_payload():
    summary = normalize_gateway_summary(
        {
            "query_count": 2631,
            "success_count": 2458,
            "failed_count": 167,
            "physical_denied_count": 0,
            "stability": 93.42,
            "by_data_level": {},
            "runtime": {
                "queued_count": 0,
                "running_count": 0,
                "pending_count": 0,
                "avg_queue_wait_ms": 120111,
                "max_current_queue_wait_ms": 0,
                "avg_execute_ms": 137999,
                "remote_timeout_count": 0,
                "client_wait_timeout_count": 15,
                "timeout_count": 15,
                "rejected_count": 0,
                "export_request_count": 1,
                "export_success_count": 1,
                "export_failure_count": 0,
                "spool_result_count": 6,
                "spool_result_total_bytes": 256524111,
                "publish_conflict_count": 0,
            },
        }
    )

    assert summary["queued_count"] == 0
    assert summary["avg_queue_wait_ms"] == 120111
    assert summary["client_wait_timeout_count"] == 15
    assert summary["spool_object_count"] == 6
    assert summary["spool_result_total_bytes"] == 256524111
    assert summary["export_success_count"] == 1


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
                    "runtime": {
                        "queued_count": 1,
                        "spool_result_count": 7,
                    },
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


def test_gateway_telemetry_client_reads_readyz_raw_payload(monkeypatch):
    class _Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "status": "healthy",
                "checks": {
                    "database": "ok",
                    "worker": "ok",
                    "spool": "ok",
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

    readiness = client.get_readiness()

    assert readiness["status"] == "healthy"
    assert readiness["checks"]["worker"] == "ok"
    assert calls[0][0] == "http://dw-query-gateway:8000/readyz"


def test_gateway_query_client_posts_sql_dry_run(monkeypatch):
    class _Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "success": True,
                "data": {
                    "status": "passed",
                    "compiled_sql": "SELECT 1",
                    "telemetry": {"dry_run_id": "dry_1"},
                },
            }

    calls = []

    def fake_post(url, *, json=None, headers=None, timeout=None):
        calls.append((url, json, headers, timeout))
        return _Response()

    monkeypatch.setattr("app.infrastructure.gateway.telemetry_client.requests.post", fake_post)
    client = GatewayQueryClient(
        base_url="http://dw-query-gateway:8000",
        platform_service_token="platform-secret",
        timeout_seconds=3,
        sql_dry_run_path="/api/v1/queries/dry-run",
    )

    result = client.dry_run_sql(
        {
            "sql": "SELECT 1",
            "access_context": {
                "resource_set_physical": [{"project": "qa_live_1"}],
                "semantic_asset_refs": ["cube.student_comment"],
            },
            "idempotency_key": "semantic-release-preview:default:session_1",
            "runtime_options": {"mode": "semantic_release_preview"},
        }
    )

    assert result["status"] == "passed"
    assert result["compiled_sql"] == "SELECT 1"
    assert calls == [
        (
            "http://dw-query-gateway:8000/api/v1/queries/dry-run",
            {
                "sql": "SELECT 1",
                "project": "qa_live_1",
                "access_context": {
                    "resource_set_physical": [{"project": "qa_live_1"}],
                    "semantic_asset_refs": ["cube.student_comment"],
                },
                "idempotency_key": "semantic-release-preview:default:session_1",
                "runtime_options": {
                    "mode": "semantic_release_preview",
                    "dry_run": True,
                },
            },
            {"X-Platform-Service-Token": "platform-secret"},
            3,
        )
    ]


def test_gateway_query_client_sql_dry_run_maps_gateway_error(monkeypatch):
    class _Response:
        status_code = 502

        @staticmethod
        def json():
            return {"success": False, "error": {"message": "gateway down"}}

    def fake_post(url, *, json=None, headers=None, timeout=None):
        return _Response()

    monkeypatch.setattr("app.infrastructure.gateway.telemetry_client.requests.post", fake_post)
    client = GatewayQueryClient(
        base_url="http://dw-query-gateway:8000",
        platform_service_token="platform-secret",
        timeout_seconds=3,
    )

    with pytest.raises(GatewayQueryError, match="gateway SQL dry-run failed: 502"):
        client.dry_run_sql({"sql": "SELECT 1"})


def test_gateway_query_client_sql_dry_run_rejects_semantic_spec():
    client = GatewayQueryClient(
        base_url="http://dw-query-gateway:8000",
        platform_service_token="platform-secret",
        timeout_seconds=3,
    )

    with pytest.raises(GatewayQueryError, match="does not accept semantic_spec"):
        client.dry_run_sql({"sql": "SELECT 1", "semantic_spec": {}})
