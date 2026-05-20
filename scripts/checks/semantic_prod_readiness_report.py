#!/usr/bin/env python3
"""生成语义平台生产上线前补证 readiness 报告。"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Mapping
from typing import Any
from urllib.parse import SplitResult, urlsplit, urlunsplit

from scripts.checks.semantic_prod_env_guard import check_env


STRICT_ARGS = argparse.Namespace(
    require_baseline=True,
    require_live=True,
    require_fixture=True,
    require_postgres_concurrency=True,
)


def build_report(env: Mapping[str, str]) -> dict[str, Any]:
    """按 strict gate 需要的四类证据生成不含明文密钥的报告。"""

    baseline_url = _value(env, "SEMANTIC_BASELINE_DATABASE_URL")
    fixture_url, fixture_source = _resolve_with_source(
        env,
        primary_key="SEMANTIC_FIXTURE_DATABASE_URL",
        fallback_key="SEMANTIC_BASELINE_DATABASE_URL",
    )
    postgres_url, postgres_source = _resolve_with_source(
        env,
        primary_key="SEMANTIC_POSTGRES_DATABASE_URL",
        fallback_key="SEMANTIC_BASELINE_DATABASE_URL",
    )
    fixture_namespace = _value(env, "SEMANTIC_FIXTURE_NAMESPACE")
    strict_problems = check_env(STRICT_ARGS, env)
    checks = {
        "baseline_fingerprint": {
            "status": "ready" if baseline_url else "blocked",
            "required": ["SEMANTIC_BASELINE_DATABASE_URL"],
            "evidence": "semantic-baseline-dry-run",
        },
        "live_smoke": {
            "status": "ready" if _value(env, "SEMANTIC_PROD_LIVE") == "1" else "blocked",
            "required": ["SEMANTIC_PROD_LIVE=1"],
            "evidence": "smoke-semantic-live",
        },
        "fixture_cleanup": {
            "status": "ready" if fixture_namespace and fixture_url else "blocked",
            "required": ["SEMANTIC_FIXTURE_NAMESPACE", "SEMANTIC_FIXTURE_DATABASE_URL or SEMANTIC_BASELINE_DATABASE_URL"],
            "evidence": "semantic-fixture-cleanup",
        },
        "postgres_concurrency": {
            "status": "ready" if _is_postgresql_url(postgres_url) else "blocked",
            "required": ["SEMANTIC_POSTGRES_DATABASE_URL or PostgreSQL SEMANTIC_BASELINE_DATABASE_URL"],
            "evidence": "test-semantic-postgres-concurrency",
        },
    }
    return {
        "status": "ready_for_strict" if not strict_problems else "blocked",
        "checks": checks,
        "strict_problems": strict_problems,
        "resolved_inputs": {
            "baseline_database_url": mask_url(baseline_url),
            "fixture_database_url": mask_url(fixture_url),
            "fixture_database_url_source": fixture_source,
            "fixture_namespace": fixture_namespace or None,
            "postgres_database_url": mask_url(postgres_url),
            "postgres_database_url_source": postgres_source,
            "live_smoke_enabled": _value(env, "SEMANTIC_PROD_LIVE") == "1",
        },
    }


def mask_url(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    parts = urlsplit(raw)
    if not parts.scheme or not parts.netloc or parts.password is None:
        return raw
    username = parts.username or ""
    hostname = parts.hostname or ""
    port = f":{parts.port}" if parts.port is not None else ""
    auth = f"{username}:***@" if username else "***@"
    masked = SplitResult(
        scheme=parts.scheme,
        netloc=f"{auth}{hostname}{port}",
        path=parts.path,
        query=parts.query,
        fragment=parts.fragment,
    )
    return urlunsplit(masked)


def _resolve_with_source(
    env: Mapping[str, str],
    *,
    primary_key: str,
    fallback_key: str,
) -> tuple[str, str | None]:
    primary_value = _value(env, primary_key)
    if primary_value:
        return primary_value, primary_key
    fallback_value = _value(env, fallback_key)
    if fallback_value:
        return fallback_value, fallback_key
    return "", None


def _value(env: Mapping[str, str], key: str) -> str:
    return str(env.get(key) or "").strip()


def _is_postgresql_url(value: str) -> bool:
    return value.startswith("postgresql://") or value.startswith("postgresql+")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="semantic production readiness report")
    parser.add_argument("--strict", action="store_true", help="缺少 strict 补证时返回非零退出码")
    args = parser.parse_args(argv)

    report = build_report(os.environ)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 1 if args.strict and report["status"] != "ready_for_strict" else 0


if __name__ == "__main__":
    raise SystemExit(main())
