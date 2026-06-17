from __future__ import annotations

from scripts.checks.semantic_prod_readiness_report import build_report, mask_url


def test_semantic_prod_readiness_report_masks_secret_and_blocks_missing_inputs():
    report = build_report(
        {
            "DATABASE_URL": "postgresql://user:secret@example.com/semantic",
            "SEMANTIC_FIXTURE_NAMESPACE": "qa_live_20260520",
            "SEMANTIC_PROD_LIVE": "0",
        }
    )

    assert report["status"] == "blocked"
    assert report["resolved_inputs"]["database_url"] == "postgresql://user:***@example.com/semantic"
    assert "secret" not in str(report)
    assert report["checks"]["baseline_fingerprint"]["status"] == "ready"
    assert report["checks"]["fixture_cleanup"]["status"] == "ready"
    assert report["checks"]["postgres_concurrency"]["status"] == "ready"
    assert report["checks"]["live_smoke"]["status"] == "blocked"
    assert report["checks"]["query_gateway_execute"]["status"] == "blocked"
    assert report["strict_problems"] == [
        "SEMANTIC_PROD_LIVE must be set to 1 for live semantic smoke",
        "QUERY_GATEWAY_BASE_URL is required for semantic execute gateway verification",
        "QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN is required for semantic execute gateway verification",
    ]


def test_semantic_prod_readiness_report_accepts_full_strict_inputs():
    report = build_report(
        {
            "DATABASE_URL": "postgresql://example/semantic",
            "SEMANTIC_FIXTURE_NAMESPACE": "qa_live_20260520",
            "SEMANTIC_PROD_LIVE": "1",
            "QUERY_GATEWAY_BASE_URL": "http://dw-query-gateway:8000",
            "QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN": "gateway-secret",
        }
    )

    assert report["status"] == "ready_for_strict"
    assert report["strict_problems"] == []
    assert report["checks"]["baseline_fingerprint"]["status"] == "ready"
    assert report["checks"]["live_smoke"]["status"] == "ready"
    assert report["checks"]["fixture_cleanup"]["status"] == "ready"
    assert report["checks"]["postgres_concurrency"]["status"] == "ready"
    assert report["checks"]["query_gateway_execute"]["status"] == "ready"
    assert report["resolved_inputs"]["database_url"] == "postgresql://example/semantic"
    assert report["resolved_inputs"]["query_gateway_token_present"] is True
    assert "gateway-secret" not in str(report)


def test_semantic_prod_readiness_report_uses_single_database_url_for_strict_checks():
    report = build_report(
        {
            "DATABASE_URL": "postgresql://user:secret@example.com/semantic",
            "SEMANTIC_FIXTURE_NAMESPACE": "qa_live_20260520",
            "SEMANTIC_PROD_LIVE": "1",
            "QUERY_GATEWAY_BASE_URL": "http://dw-query-gateway:8000",
            "QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN": "gateway-secret",
        }
    )

    assert report["status"] == "ready_for_strict"
    assert report["strict_problems"] == []
    assert report["resolved_inputs"]["database_url"] == "postgresql://user:***@example.com/semantic"
    assert "secret" not in str(report)
    assert report["checks"]["baseline_fingerprint"]["status"] == "ready"
    assert report["checks"]["fixture_cleanup"]["status"] == "ready"
    assert report["checks"]["postgres_concurrency"]["status"] == "ready"
    assert report["checks"]["query_gateway_execute"]["status"] == "ready"


def test_mask_url_handles_non_url_and_passwordless_url():
    assert mask_url("not-a-url") == "not-a-url"
    assert mask_url("postgresql://example/preprod") == "postgresql://example/preprod"
    assert mask_url("") is None
