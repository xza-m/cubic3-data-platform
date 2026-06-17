from __future__ import annotations

import pytest

from app.infrastructure.gateway.telemetry_client import (
    GatewayQueryClient,
    GatewayQueryError,
    GatewayTelemetryClient,
    build_gateway_observability_snapshot,
    build_gateway_summary_from_sections,
)


def test_build_gateway_summary_from_new_metric_sections():
    summary = build_gateway_summary_from_sections(
        overview={
            "data": {
                "query": {
                    "total": 247,
                    "success": 234,
                    "failed": 11,
                    "rejected": 0,
                    "timeout": 28,
                    "physical_denied": 0,
                    "success_rate": 95.51,
                    "timeout_rate": 11.34,
                },
                "runtime": {
                    "queued": 0,
                    "running": 0,
                    "pending": 0,
                    "queue_wait_avg_ms": 7287,
                    "queue_wait_current_max_ms": 0,
                    "queue_wait_p95_ms": 45178,
                    "execute_avg_ms": 19156,
                    "execute_p95_ms": 69393,
                },
            },
            "generated_at": "2026-06-11T12:51:34Z",
            "metric_version": "gateway-observability.v1",
            "source": "dw-query-gateway-postgres",
            "window": "24h",
        },
        breakdowns={"data": {"data_level": [{"key": "missing", "count": 244}, {"key": "M1", "count": 1}]}},
        result_export_storage={
            "data": {
                "export": {"request": 107, "started": 91, "success": 91, "not_ready": 16, "failure": 0},
                "spool_result_count": 234,
                "spool_result_total_bytes": 312246249,
                "spool_age_buckets": {"lt_1h": 2, "h1_24h": 232},
            }
        },
        security={
            "data": {
                "auth_denied_count": 14,
                "invalid_token_count": 8,
                "missing_token_count": 1,
                "legacy_protocol_count": 31,
                "sql_guard_rejected_count": 0,
            }
        },
        workers={
            "data": {
                "live_worker_count": 1,
                "active_worker_count": 1,
                "worker_capacity": 2,
                "heartbeat_stale_count": 3,
                "housekeeping_completed_count": 47,
            }
        },
    )

    assert summary["query_count"] == 247
    assert summary["success_count"] == 234
    assert summary["stability"] == 95.51
    assert summary["timeout_count"] == 28
    assert summary["queue_wait_p95_ms"] == 45178
    assert summary["execute_p95_ms"] == 69393
    assert summary["by_data_level"] == {"M1": 1}
    assert summary["export_request_count"] == 107
    assert summary["spool_object_count"] == 234
    assert summary["auth_denied_count"] == 14
    assert summary["invalid_token_count"] == 8
    assert summary["legacy_protocol_count"] == 31
    assert summary["worker_heartbeat_stale_count"] == 3
    assert summary["worker_capacity"] == 2
    assert summary["metric_version"] == "gateway-observability.v1"


def test_gateway_telemetry_client_builds_observability_snapshot(monkeypatch):
    class _Response:
        def __init__(self, payload):
            self._payload = payload

        status_code = 200

        def json(self):
            return self._payload

    calls = []

    def fake_get(url, *, params=None, headers=None, timeout=None):
        calls.append((url, params, headers, timeout))
        if url.endswith("/overview"):
            return _Response(
                {
                    "success": True,
                    "data": {
                        "data": {"query": {"total": 2, "success": 1}, "runtime": {"queued": 1}},
                        "metric_version": "gateway-observability.v1",
                        "window": "24h",
                    },
                }
            )
        if url.endswith("/timeseries"):
            return _Response(
                {"success": True, "data": {"data": {"bucket": "1h", "points": [{"bucket_start": "2026-06-11T11:00:00Z"}]}}}
            )
        if url.endswith("/breakdowns"):
            return _Response({"success": True, "data": {"data": {"data_level": [{"key": "M1", "count": 2}]}}})
        if url.endswith("/contract-completeness"):
            return _Response({"success": True, "data": {"data": {"total": 2, "platform_governed_count": 1}}})
        if url.endswith("/result-export-storage"):
            return _Response({"success": True, "data": {"data": {"spool_result_count": 7}}})
        if url.endswith("/security"):
            return _Response({"success": True, "data": {"data": {"auth_denied_count": 1}}})
        if url.endswith("/workers"):
            return _Response({"success": True, "data": {"data": {"live_worker_count": 1, "worker_capacity": 2}}})
        if url.endswith("/query-runs"):
            return _Response({"success": True, "data": {"items": [{"query_id": "q1"}]}})
        raise AssertionError(url)

    monkeypatch.setattr("app.infrastructure.gateway.telemetry_client.requests.get", fake_get)
    client = GatewayTelemetryClient(
        base_url="http://dw-query-gateway:8000",
        platform_service_token="platform-secret",
        timeout_seconds=3,
    )

    snapshot = client.get_observability_snapshot(window="24h", bucket="1h", query_run_limit=1)

    assert snapshot["summary"]["queued_count"] == 1
    assert snapshot["summary"]["spool_object_count"] == 7
    assert snapshot["summary"]["stability"] == 50
    assert snapshot["contract_completeness"]["platform_governed_count"] == 1
    assert snapshot["query_runs"]["items"][0]["query_id"] == "q1"
    assert [call[0].rsplit("/", 1)[-1] for call in calls] == [
        "overview",
        "timeseries",
        "breakdowns",
        "contract-completeness",
        "result-export-storage",
        "security",
        "workers",
        "query-runs",
    ]


def test_build_gateway_observability_snapshot_collects_new_sections():
    snapshot = build_gateway_observability_snapshot(
        overview={
            "data": {
                "query": {"total": 1, "success": 1, "success_rate": 100},
                "runtime": {"queued": 0},
            },
            "generated_at": "2026-06-11T12:00:00Z",
            "metric_version": "gateway-observability.v1",
            "source": "dw-query-gateway-postgres",
            "window": "24h",
            "is_partial": False,
        },
        timeseries={"data": {"bucket": "1h", "points": [{"bucket_start": "2026-06-11T11:00:00Z", "query_total": 1}]}},
        breakdowns={"data": {"data_level": [{"key": "M1", "count": 1}]}},
        contract_completeness={"data": {"total": 1, "platform_governed_count": 1}},
        result_export_storage={"data": {"export": {"request": 1}}},
        security={"data": {"auth_denied_count": 0}},
        workers={"data": {"live_worker_count": 1}},
        query_runs={"items": [{"query_id": "q1"}]},
        window="24h",
        bucket="1h",
    )

    assert snapshot["metric_version"] == "gateway-observability.v1"
    assert snapshot["summary"]["query_count"] == 1
    assert snapshot["timeseries"]["points"][0]["query_total"] == 1
    assert snapshot["contract_completeness"]["platform_governed_count"] == 1
    assert snapshot["query_runs"]["total"] == 1


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
