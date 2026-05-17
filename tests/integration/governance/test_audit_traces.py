# tests/integration/governance/test_audit_traces.py
"""
W5.B · Governance / Audit Trace API 集成测试

通过工厂 ``create_governance_blueprint(audit_repository)`` 注入 Mock 仓库，
独立 Flask app。

覆盖路径：
  GET /api/v1/governance/audit-traces                → 列表 + 过滤
  GET /api/v1/governance/audit-traces/<trace_id>     → 详情（happy & 404）

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.governance import create_governance_blueprint

BASE = "/api/v1/governance/audit-traces"


def _make_trace(trace_id: str = "t1", **fields):
    """构造一个支持 ``model_dump(mode='json')`` 的 trace 对象。"""
    obj = MagicMock()
    obj.model_dump.return_value = {
        "trace_id": trace_id,
        "policy_name": fields.get("policy_name", "default"),
        "decision": fields.get("decision", "allow"),
        **fields,
    }
    return obj


def _build_client(repository: MagicMock):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    bp = create_governance_blueprint(repository)
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    from tests.conftest import install_default_admin_auth
    return flask_app, install_default_admin_auth(
        flask_app.test_client(),
        roles=("admin", "platform_admin"),
    )


@pytest.mark.redesign
class TestListAuditTraces:
    def test_list_all_when_no_filter(self):
        repo = MagicMock()
        repo.list_all.return_value = [_make_trace("t1"), _make_trace("t2")]
        _, client = _build_client(repo)

        resp = client.get(BASE)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["data"]["total"] == 2
        assert {t["trace_id"] for t in body["data"]["items"]} == {"t1", "t2"}
        repo.list_all.assert_called_once()
        repo.list_filtered.assert_not_called()

    def test_list_filtered_when_policy_provided(self):
        repo = MagicMock()
        repo.list_filtered.return_value = [_make_trace("t1", policy_name="strict")]
        _, client = _build_client(repo)

        resp = client.get(f"{BASE}?policy=strict&decision=deny")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["data"]["total"] == 1
        kwargs = repo.list_filtered.call_args.kwargs
        assert kwargs["policy_name"] == "strict"
        assert kwargs["decision"] == "deny"


@pytest.mark.redesign
class TestGetAuditTrace:
    def test_get_happy(self):
        repo = MagicMock()
        repo.get.return_value = _make_trace("t-found", decision="deny")
        _, client = _build_client(repo)

        resp = client.get(f"{BASE}/t-found")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["trace_id"] == "t-found"
        assert data["decision"] == "deny"

    def test_get_missing_returns_404(self):
        repo = MagicMock()
        repo.get.return_value = None
        _, client = _build_client(repo)

        resp = client.get(f"{BASE}/nope")
        assert resp.status_code == 404
        assert resp.get_json()["code"] != 0


@pytest.mark.redesign
class TestGovernanceAuth:
    def test_list_requires_auth(self):
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_governance_blueprint(MagicMock())
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        resp = flask_app.test_client().get(BASE)
        assert resp.status_code == 401
