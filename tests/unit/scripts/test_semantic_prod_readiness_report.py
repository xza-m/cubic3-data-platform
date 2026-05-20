from __future__ import annotations

from scripts.checks.semantic_prod_readiness_report import build_report, mask_url


def test_semantic_prod_readiness_report_masks_secret_and_blocks_missing_inputs():
    report = build_report(
        {
            "SEMANTIC_BASELINE_DATABASE_URL": "postgresql://user:secret@example.com/semantic",
            "SEMANTIC_FIXTURE_NAMESPACE": "qa_live_20260520",
            "SEMANTIC_PROD_LIVE": "0",
        }
    )

    assert report["status"] == "blocked"
    assert report["resolved_inputs"]["baseline_database_url"] == "postgresql://user:***@example.com/semantic"
    assert report["resolved_inputs"]["fixture_database_url"] == "postgresql://user:***@example.com/semantic"
    assert report["resolved_inputs"]["fixture_database_url_source"] == "SEMANTIC_BASELINE_DATABASE_URL"
    assert "secret" not in str(report)
    assert report["checks"]["baseline_fingerprint"]["status"] == "ready"
    assert report["checks"]["fixture_cleanup"]["status"] == "ready"
    assert report["checks"]["postgres_concurrency"]["status"] == "ready"
    assert report["checks"]["live_smoke"]["status"] == "blocked"
    assert report["strict_problems"] == ["SEMANTIC_PROD_LIVE must be set to 1 for live semantic smoke"]


def test_semantic_prod_readiness_report_accepts_full_strict_inputs():
    report = build_report(
        {
            "SEMANTIC_BASELINE_DATABASE_URL": "postgresql://example/preprod",
            "SEMANTIC_FIXTURE_DATABASE_URL": "postgresql://example/fixture",
            "SEMANTIC_FIXTURE_NAMESPACE": "qa_live_20260520",
            "SEMANTIC_PROD_LIVE": "1",
            "SEMANTIC_POSTGRES_DATABASE_URL": "postgresql://example/concurrency",
        }
    )

    assert report["status"] == "ready_for_strict"
    assert report["strict_problems"] == []
    assert report["checks"]["baseline_fingerprint"]["status"] == "ready"
    assert report["checks"]["live_smoke"]["status"] == "ready"
    assert report["checks"]["fixture_cleanup"]["status"] == "ready"
    assert report["checks"]["postgres_concurrency"]["status"] == "ready"
    assert report["resolved_inputs"]["fixture_database_url_source"] == "SEMANTIC_FIXTURE_DATABASE_URL"
    assert report["resolved_inputs"]["postgres_database_url_source"] == "SEMANTIC_POSTGRES_DATABASE_URL"


def test_mask_url_handles_non_url_and_passwordless_url():
    assert mask_url("not-a-url") == "not-a-url"
    assert mask_url("postgresql://example/preprod") == "postgresql://example/preprod"
    assert mask_url("") is None
