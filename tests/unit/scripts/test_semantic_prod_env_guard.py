from __future__ import annotations

from argparse import Namespace

from scripts.checks.semantic_prod_env_guard import check_env


def _args(**overrides):
    defaults = {
        "require_baseline": False,
        "require_live": False,
        "require_fixture": False,
        "require_postgres_concurrency": False,
    }
    defaults.update(overrides)
    return Namespace(**defaults)


def test_semantic_prod_env_guard_requires_database_url():
    problems = check_env(_args(require_baseline=True), {})

    assert problems == ["DATABASE_URL is required for semantic schema fingerprint verification"]


def test_semantic_prod_env_guard_requires_live_opt_in_value():
    problems = check_env(_args(require_live=True), {"SEMANTIC_PROD_LIVE": "0"})

    assert problems == ["SEMANTIC_PROD_LIVE must be set to 1 for live semantic smoke"]


def test_semantic_prod_env_guard_requires_fixture_cleanup_scope():
    problems = check_env(
        _args(require_fixture=True),
        {"DATABASE_URL": "postgresql://example/semantic"},
    )

    assert problems == [
        "SEMANTIC_FIXTURE_NAMESPACE is required for fixture cleanup",
    ]


def test_semantic_prod_env_guard_accepts_single_database_url_for_all_db_checks():
    problems = check_env(
        _args(
            require_baseline=True,
            require_live=True,
            require_fixture=True,
            require_postgres_concurrency=True,
        ),
        {
            "DATABASE_URL": "postgresql://example/semantic",
            "SEMANTIC_FIXTURE_NAMESPACE": "qa_live_20260519",
            "SEMANTIC_PROD_LIVE": "1",
        },
    )

    assert problems == []


def test_semantic_prod_env_guard_requires_postgres_for_concurrency():
    problems = check_env(_args(require_postgres_concurrency=True), {})

    assert problems == ["DATABASE_URL is required for PostgreSQL concurrency verification"]


def test_semantic_prod_env_guard_rejects_non_postgresql_concurrency_url():
    problems = check_env(
        _args(require_postgres_concurrency=True),
        {"DATABASE_URL": "sqlite:///:memory:"},
    )

    assert problems == ["DATABASE_URL must be a PostgreSQL URL for semantic production verification"]
