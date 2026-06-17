from __future__ import annotations

from app.infrastructure.gateway.alerting import evaluate_gateway_alerts


def test_evaluate_gateway_alerts_flags_real_runtime_risks():
    result = evaluate_gateway_alerts(
        {
            "query_count": 2631,
            "success_count": 2458,
            "failed_count": 167,
            "stability": 93.42,
            "queued_count": 0,
            "running_count": 0,
            "pending_count": 0,
            "avg_queue_wait_ms": 120111,
            "max_current_queue_wait_ms": 0,
            "timeout_count": 15,
            "result_rejected_count": 2,
            "export_not_ready_count": 3,
            "export_failure_count": 0,
            "publish_conflict_count": 0,
            "auth_denied_count": 1,
            "legacy_protocol_count": 4,
            "worker_heartbeat_stale_count": 2,
            "worker_orphan_lease_reclaimed_count": 1,
            "gateway_readyz_degraded_count": 1,
        },
        readiness={
            "status": "healthy",
            "checks": {
                "database": "ok",
                "worker": "ok",
                "spool": "ok",
            },
        },
    )

    codes = {item["code"] for item in result["alerts"]}
    assert result["status"] == "critical"
    assert "gateway_stability_low" in codes
    assert "gateway_avg_queue_wait_high" in codes
    assert "gateway_timeout_seen" in codes
    assert "gateway_result_rejected_seen" in codes
    assert "gateway_export_not_ready_seen" in codes
    assert "gateway_auth_denied_seen" in codes
    assert "gateway_legacy_protocol_seen" in codes
    assert "gateway_worker_heartbeat_stale_seen" in codes
    assert "gateway_worker_orphan_lease_reclaimed_seen" in codes
    assert "gateway_readyz_degraded_seen" in codes
    assert result["thresholds"]["stability_critical"] == 95.0


def test_evaluate_gateway_alerts_flags_readyz_failures():
    result = evaluate_gateway_alerts(
        {"query_count": 10, "success_count": 10, "stability": 100},
        readiness={
            "status": "unhealthy",
            "checks": {
                "database": "ok",
                "worker": "error",
                "maxcompute": "ok",
            },
        },
    )

    codes = {item["code"] for item in result["alerts"]}
    assert result["status"] == "critical"
    assert "gateway_readiness_unhealthy" in codes
    assert "gateway_ready_check_failed" in codes


def test_evaluate_gateway_alerts_flags_new_security_and_worker_metrics():
    result = evaluate_gateway_alerts(
        {
            "query_count": 10,
            "success_count": 10,
            "stability": 100,
            "invalid_token_count": 2,
            "missing_token_count": 1,
            "credential_missing_count": 1,
            "credential_invalid_count": 1,
            "live_worker_count": 0,
            "worker_capacity": 2,
        },
        readiness={"status": "healthy", "checks": {"database": "ok"}},
    )

    codes = {item["code"] for item in result["alerts"]}
    assert result["status"] == "critical"
    assert "gateway_worker_unavailable" in codes
    assert "gateway_invalid_token_seen" in codes
    assert "gateway_missing_token_seen" in codes
    assert "gateway_credential_missing_seen" in codes
    assert "gateway_credential_invalid_seen" in codes
