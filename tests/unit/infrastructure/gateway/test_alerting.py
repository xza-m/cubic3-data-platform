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
            "export_failure_count": 0,
            "publish_conflict_count": 0,
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
