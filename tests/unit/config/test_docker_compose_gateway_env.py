from __future__ import annotations

from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
REQUIRED_GATEWAY_ENV_KEYS = {
    "QUERY_GATEWAY_BASE_URL",
    "QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN",
    "QUERY_GATEWAY_TIMEOUT_SECONDS",
    "QUERY_GATEWAY_SQL_DRY_RUN_PATH",
}


def _environment_map(service_name: str) -> dict[str, str]:
    compose = yaml.safe_load((REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    entries = compose["services"][service_name]["environment"]
    result: dict[str, str] = {}
    for entry in entries:
        key, _, value = str(entry).partition("=")
        result[key] = value
    return result


def test_backend_injects_query_gateway_environment_from_compose_env():
    env = _environment_map("backend")

    assert REQUIRED_GATEWAY_ENV_KEYS <= set(env)
    assert env["QUERY_GATEWAY_BASE_URL"].startswith("${QUERY_GATEWAY_BASE_URL")
    assert env["QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN"] == "${QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN}"
    assert env["QUERY_GATEWAY_TIMEOUT_SECONDS"].startswith("${QUERY_GATEWAY_TIMEOUT_SECONDS")
    assert env["QUERY_GATEWAY_SQL_DRY_RUN_PATH"].startswith(
        "${QUERY_GATEWAY_SQL_DRY_RUN_PATH"
    )


def test_rq_worker_keeps_query_gateway_environment_aligned_with_backend():
    backend_env = _environment_map("backend")
    worker_env = _environment_map("rq_worker")

    assert {
        key: worker_env.get(key)
        for key in REQUIRED_GATEWAY_ENV_KEYS
    } == {
        key: backend_env.get(key)
        for key in REQUIRED_GATEWAY_ENV_KEYS
    }
