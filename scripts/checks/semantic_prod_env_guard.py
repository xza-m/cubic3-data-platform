#!/usr/bin/env python3
"""语义生产候选严格验证环境变量门禁。"""
from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Mapping


def check_env(args: argparse.Namespace, env: Mapping[str, str]) -> list[str]:
    problems: list[str] = []
    database_url = _value(env, "DATABASE_URL")

    if args.require_baseline and not database_url:
        problems.append("DATABASE_URL is required for semantic schema fingerprint verification")
    if args.require_live and _value(env, "SEMANTIC_PROD_LIVE") != "1":
        problems.append("SEMANTIC_PROD_LIVE must be set to 1 for live semantic smoke")
    if args.require_fixture:
        if not _value(env, "SEMANTIC_FIXTURE_NAMESPACE"):
            problems.append("SEMANTIC_FIXTURE_NAMESPACE is required for fixture cleanup")
        if not database_url:
            problems.append("DATABASE_URL is required for fixture cleanup")
    if args.require_postgres_concurrency and not database_url:
        problems.append("DATABASE_URL is required for PostgreSQL concurrency verification")
    elif args.require_postgres_concurrency and not _is_postgresql_url(database_url):
        problems.append("DATABASE_URL must be a PostgreSQL URL for semantic production verification")
    return problems


def _value(env: Mapping[str, str], key: str) -> str:
    return str(env.get(key) or "").strip()


def _is_postgresql_url(value: str) -> bool:
    return value.startswith("postgresql://") or value.startswith("postgresql+")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="semantic production strict env guard")
    parser.add_argument("--require-baseline", action="store_true")
    parser.add_argument("--require-live", action="store_true")
    parser.add_argument("--require-fixture", action="store_true")
    parser.add_argument("--require-postgres-concurrency", action="store_true")
    args = parser.parse_args(argv)

    problems = check_env(args, os.environ)
    if problems:
        print("[semantic-prod][env] missing required production verification inputs", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print("[semantic-prod][env] required production verification inputs OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
