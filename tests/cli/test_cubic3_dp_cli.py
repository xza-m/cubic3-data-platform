from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest


CLI_ROOT = Path(__file__).resolve().parents[2] / "cli"
if str(CLI_ROOT) not in sys.path:
    sys.path.insert(0, str(CLI_ROOT))

from cubic3_dp_cli.main import main  # noqa: E402


class FakeResponse:
    def __init__(self, payload: dict[str, Any], *, status_code: int = 200, headers: dict[str, str] | None = None):
        self._payload = payload
        self.status_code = status_code
        self.content = json.dumps(payload).encode("utf-8")
        self.headers = headers or {}

    def json(self) -> dict[str, Any]:
        return self._payload


@pytest.fixture(autouse=True)
def isolated_cli_config(monkeypatch, tmp_path):
    monkeypatch.setenv("CUBIC3_DP_CONFIG", str(tmp_path / "config.json"))
    monkeypatch.delenv("CUBIC3_DP_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("CUBIC3_DP_REFRESH_TOKEN", raising=False)
    monkeypatch.delenv("CUBIC3_DP_API_KEY", raising=False)
    monkeypatch.delenv("CUBIC3_DP_BASE_URL", raising=False)


def test_datasource_list_sends_bearer_token_and_filters(monkeypatch, capsys):
    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse(
            {
                "code": 0,
                "message": "success",
                "data": {"items": [{"id": 1, "name": "warehouse"}], "total": 1},
            }
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    exit_code = main(
        [
            "--base-url",
            "http://api.local",
            "--access-token",
            "access-token",
            "datasource",
            "list",
            "--source-type",
            "postgresql",
            "--active",
            "true",
        ]
    )

    assert exit_code == 0
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"] == "http://api.local/api/v1/data-center/datasources"
    assert calls[0]["headers"]["Authorization"] == "Bearer access-token"
    assert calls[0]["params"]["source_type"] == "postgresql"
    assert calls[0]["params"]["is_active"] == "true"
    assert json.loads(capsys.readouterr().out)["total"] == 1


def test_semantic_plan_sends_api_key(monkeypatch):
    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse({"code": 0, "message": "success", "data": {"runtime_mode": "official"}})

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    exit_code = main(["--api-key", "ak-test", "semantic", "plan", "最近7天评论数"])

    assert exit_code == 0
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == "http://localhost:5000/api/v1/agent/semantic/plan"
    assert calls[0]["headers"]["X-C3-Api-Key"] == "ak-test"
    assert calls[0]["json"] == {"question": "最近7天评论数"}


def test_global_output_table_precedes_command(monkeypatch, capsys):
    def fake_request(self, method, url, **kwargs):
        return FakeResponse(
            {
                "code": 0,
                "message": "success",
                "data": {"items": [{"id": 1, "name": "warehouse"}], "total": 1},
            }
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    exit_code = main(["--output", "table", "datasource", "list"])

    assert exit_code == 0
    output = capsys.readouterr().out
    assert "id" in output
    assert "warehouse" in output


def test_semantic_execute_requires_explicit_confirmation(monkeypatch, capsys):
    def fail_request(*args, **kwargs):
        raise AssertionError("execute should not call API without --yes")

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fail_request)

    exit_code = main(["semantic", "execute", "最近7天评论数"])

    assert exit_code == 2
    assert "--yes" in capsys.readouterr().err


def test_asset_sync_posts_json_payload_with_confirmation(monkeypatch, tmp_path):
    payload_path = tmp_path / "payload.json"
    payload_path.write_text(json.dumps({"source_id": "maxcompute-prod", "tables": []}), encoding="utf-8")
    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse(
            {
                "code": 0,
                "message": "created",
                "data": {"id": "sync_1", "source_id": "maxcompute-prod", "status": "success"},
            },
            status_code=201,
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    exit_code = main(["semantic", "assets", "sync", str(payload_path), "--yes"])

    assert exit_code == 0
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == "http://localhost:5000/api/v1/semantic/assets/sync-runs"
    assert calls[0]["json"] == {"source_id": "maxcompute-prod", "tables": []}


def test_governance_audit_get_encodes_trace_id(monkeypatch):
    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse(
            {
                "code": 0,
                "message": "success",
                "data": {"trace_id": "trace/1", "decision": "allow"},
            }
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    exit_code = main(["governance", "audit", "get", "trace/1"])

    assert exit_code == 0
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"] == "http://localhost:5000/api/v1/governance/audit-traces/trace%2F1"


def test_auth_login_accepts_email_and_saves_profile_token_pair(monkeypatch, capsys):
    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        if url.endswith("/api/v1/auth/login"):
            return FakeResponse(
                {
                    "code": 0,
                    "message": "success",
                    "data": {
                        "access_token": "access-from-login",
                        "refresh_token": "refresh-from-login",
                        "expires_in": 3600,
                        "refresh_expires_in": 2592000,
                    },
                }
            )
        return FakeResponse(
            {
                "code": 0,
                "message": "success",
                "data": {"items": [{"id": 1, "name": "warehouse"}], "total": 1},
            }
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    login_exit = main(["auth", "login", "--email", "admin@example.com", "--password", "secret"])
    assert login_exit == 0
    login_output = json.loads(capsys.readouterr().out)
    assert login_output["saved"] is True
    assert "access_token" not in login_output
    assert "refresh_token" not in login_output
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == "http://localhost:5000/api/v1/auth/login"
    assert calls[0]["json"] == {"username": "admin@example.com", "password": "secret"}

    list_exit = main(["datasource", "list"])
    assert list_exit == 0
    assert calls[1]["headers"]["Authorization"] == "Bearer access-from-login"


def test_client_refreshes_token_pair_and_retries_once(monkeypatch, capsys):
    import_exit = main([
        "auth",
        "import-pair",
        "--access-token",
        "expired-access",
        "--refresh-token",
        "refresh-old",
    ])
    assert import_exit == 0
    capsys.readouterr()

    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        if url.endswith("/api/v1/data-center/datasources") and len(calls) == 1:
            return FakeResponse(
                {"code": -1, "message": "Token has expired", "error_code": "TOKEN_EXPIRED"},
                status_code=401,
            )
        if url.endswith("/api/v1/auth/refresh"):
            assert kwargs["json"] == {"refresh_token": "refresh-old"}
            return FakeResponse(
                {
                    "code": 0,
                    "message": "success",
                    "data": {
                        "access_token": "access-new",
                        "refresh_token": "refresh-new",
                        "expires_in": 3600,
                        "refresh_expires_in": 2592000,
                    },
                }
            )
        return FakeResponse(
            {
                "code": 0,
                "message": "success",
                "data": {"items": [{"id": 1, "name": "warehouse"}], "total": 1},
            }
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    exit_code = main(["datasource", "list"])

    assert exit_code == 0
    assert calls[0]["headers"]["Authorization"] == "Bearer expired-access"
    assert calls[2]["headers"]["Authorization"] == "Bearer access-new"
    assert json.loads(capsys.readouterr().out)["total"] == 1


def test_auth_feishu_returns_platform_authorization_url_without_prefetch(monkeypatch, capsys):
    def fail_request(*args, **kwargs):
        raise AssertionError("auth feishu should not prefetch the OAuth redirect")

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fail_request)

    exit_code = main(["auth", "feishu"])

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["authorization_url"] == "http://localhost:5000/api/v1/auth/feishu/authorize?client=cli"
    assert output["complete_command"] == "cubic3-dp auth feishu --exchange-code '<cli_code>'"


def test_auth_feishu_open_browser_uses_platform_authorization_url(monkeypatch, capsys):
    opened: list[str] = []

    def fail_request(*args, **kwargs):
        raise AssertionError("auth feishu --open-browser should not prefetch the OAuth redirect")

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fail_request)
    monkeypatch.setattr("cubic3_dp_cli.commands.auth.webbrowser.open", lambda url: opened.append(url))

    exit_code = main(["--base-url", "http://api.local", "auth", "feishu", "--open-browser"])

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert opened == ["http://api.local/api/v1/auth/feishu/authorize?client=cli"]
    assert output["authorization_url"] == opened[0]
    assert output["opened_browser"] is True


def test_auth_feishu_exchange_code_saves_token_pair(monkeypatch, capsys):
    calls: list[dict[str, Any]] = []

    def fake_exchange(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse(
            {
                "code": 0,
                "message": "success",
                "data": {
                    "access_token": "access-sso",
                    "refresh_token": "refresh-sso",
                    "expires_in": 3600,
                    "refresh_expires_in": 2592000,
                },
            }
        )

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_exchange)

    exit_code = main(["auth", "feishu", "--exchange-code", "cli-code"])

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["saved"] is True
    assert output["token_source"] == "auth.feishu.exchange"
    assert calls[0]["url"] == "http://localhost:5000/api/v1/auth/feishu/exchange"
    assert calls[0]["json"] == {"code": "cli-code"}

    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse({"code": 0, "message": "success", "data": {"user_id": "u1"}})

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    whoami_exit = main(["auth", "whoami"])
    assert whoami_exit == 0
    assert calls[0]["headers"]["Authorization"] == "Bearer access-sso"


def test_auth_api_key_set_is_used_by_later_commands(monkeypatch, capsys):
    set_exit = main(["auth", "api-key", "set", "--api-key", "ak-test"])
    assert set_exit == 0
    assert json.loads(capsys.readouterr().out)["auth_type"] == "api_key"
    calls: list[dict[str, Any]] = []

    def fake_request(self, method, url, **kwargs):
        calls.append({"method": method, "url": url, **kwargs})
        return FakeResponse({"code": 0, "message": "success", "data": {"runtime_mode": "official"}})

    monkeypatch.setattr("cubic3_dp_cli.client.requests.Session.request", fake_request)

    plan_exit = main(["semantic", "plan", "最近7天评论数"])
    assert plan_exit == 0
    assert calls[0]["headers"]["X-C3-Api-Key"] == "ak-test"


def test_describe_outputs_agent_first_command_metadata(capsys):
    exit_code = main(["describe", "--command", "auth.login"])

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["command"] == "auth.login"
    assert output["matches"][0]["command"] == "auth login"
    assert output["matches"][0]["endpoint"] == "POST /api/v1/auth/login"
