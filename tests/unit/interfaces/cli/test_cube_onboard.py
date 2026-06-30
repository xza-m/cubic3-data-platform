"""cube onboard turnkey 命令单测：薄封装 + 两级写门控（CliRunner + 桩容器，不 boot 真实 app）。

桩掉 data_asset_service / onboard_spec_builder / semantic_modeling_proposal_service：
验证默认停 validated、--publish 缺 --yes 拒(2)、--dry-run 预览不发、validate blocked 停(5) 不 publish。
proposal 管线固定 source_mode='agent_led'（命令内部硬编码，避免 human_led 死锁）也一并断言。
"""
from __future__ import annotations

import contextlib
import json
import types

import pytest
from click.testing import CliRunner

from app.interfaces.cli.root import cli


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def patch_ctx(monkeypatch):
    def _apply(container):
        @contextlib.contextmanager
        def _fake_app_context():
            yield (object(), container)

        monkeypatch.setattr("app.interfaces.cli.bootstrap.app_context", _fake_app_context)

    return _apply


def _container(**providers):
    ns = types.SimpleNamespace()
    for name, service in providers.items():
        setattr(ns, name, (lambda s=service: s))
    return ns


def _payload(result):
    return json.loads(result.output)


# 一份最小可用 spec（onboard_spec_builder 桩返回它）：含 ratio 度量 / 敏感字段 / 已升指标，
# 供 _onboard_overview 抽概况（ratio_measures / sensitive_fields / lifted_metrics_count）。
_SPEC = {
    "spec_version": "v1",
    "business": {"subject": "答题宽表"},
    "cube": {
        "name": "dws_probe",
        "measures": {
            "total_count": {"type": "count"},
            "answer_cnt": {"type": "sum"},
            "avg_duration": {"type": "ratio"},
        },
    },
    "ontology": {"metrics": [{"name": "obj_total_count"}, {"name": "obj_answer_cnt"}]},
    "governance": {"sensitive_fields": ["student_id"]},
}


def _asset_svc():
    return types.SimpleNamespace(
        list_fields=lambda tid: {"items": [{"name": "answer_cnt", "type": "bigint"}], "total": 1}
    )


def _onboard_builder():
    return types.SimpleNamespace(build_onboard_spec=lambda **kw: _SPEC)


class _ProposalStub:
    """记录调用序列的 proposal 服务桩；validate 的 status 可配（validated/blocked）。"""

    def __init__(self, validate_status="validated"):
        self.calls = []
        self._validate_status = validate_status
        self.last_create_payload = None

    def create_proposal(self, payload):
        self.calls.append("create_proposal")
        self.last_create_payload = payload
        return {"id": "proposal_onb"}

    def update_spec(self, pid, payload):
        self.calls.append("update_spec")
        return {"id": pid}

    def validate(self, pid):
        self.calls.append("validate")
        blockers = [] if self._validate_status == "validated" else [{"code": "missing_grain"}]
        return {
            "id": pid,
            "status": self._validate_status,
            "validation_matrix": {"blockers": blockers},
        }

    def approve(self, pid):
        self.calls.append("approve")
        return {"id": pid, "status": "approved"}

    def apply(self, pid):
        self.calls.append("apply")
        return {"id": pid, "status": "applied"}

    def publish(self, pid):
        self.calls.append("publish")
        return {"id": pid, "status": "published", "publish_result": {"release_id": "rel_onb"}}


def _wire(prop):
    return _container(
        data_asset_service=_asset_svc(),
        onboard_spec_builder=_onboard_builder(),
        semantic_modeling_proposal_service=prop,
    )


_BASE_ARGS = [
    "cube", "onboard",
    "--source-id", "1", "--database", "df", "--table", "dws_probe",
    "--columns-from", "tbl_x",
]


# --- 默认（无 --publish）：停在 validated，输出概况 ----------------------------------

def test_onboard_no_publish_stops_at_validated(runner, patch_ctx):
    prop = _ProposalStub(validate_status="validated")
    patch_ctx(_wire(prop))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["proposal_id"] == "proposal_onb"
    assert data["validate_status"] == "validated"
    assert data["ratio_measures"] == ["avg_duration"]
    assert data["sensitive_fields"] == ["student_id"]
    assert data["lifted_metrics_count"] == 2
    # 停在 validate，绝不进 approve/apply/publish
    assert prop.calls == ["create_proposal", "update_spec", "validate"]
    # proposal 管线固定 agent_led（防 human_led 死锁）
    assert prop.last_create_payload["source_mode"] == "agent_led"


# --- --publish 缺 --yes → EXIT_USAGE(2)，不 publish --------------------------------

def test_onboard_publish_without_yes_is_usage_exit2(runner, patch_ctx):
    prop = _ProposalStub(validate_status="validated")
    patch_ctx(_wire(prop))
    result = runner.invoke(cli, _BASE_ARGS + ["--publish"])
    assert result.exit_code == 2  # 保护 live manifest
    assert "publish" not in prop.calls


# --- --publish --dry-run → 预览不发 -----------------------------------------------

def test_onboard_publish_dry_run_previews_without_publishing(runner, patch_ctx):
    prop = _ProposalStub(validate_status="validated")
    patch_ctx(_wire(prop))
    result = runner.invoke(cli, _BASE_ARGS + ["--publish", "--dry-run"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["dry_run"] is True
    assert data["action"] == "publish cube 'dws_probe' to live manifest"
    assert data["preview"]["will_publish"] is True
    # dry-run 仍跑到 validated 但绝不发布
    assert "publish" not in prop.calls
    assert prop.calls == ["create_proposal", "update_spec", "validate"]


# --- validate blocked → EXIT_NOT_READY(5)，不 publish ------------------------------

def test_onboard_validate_blocked_stops_not_ready(runner, patch_ctx):
    prop = _ProposalStub(validate_status="blocked")
    patch_ctx(_wire(prop))
    result = runner.invoke(cli, _BASE_ARGS + ["--publish", "--yes"])
    assert result.exit_code == 5  # EXIT_NOT_READY
    payload = _payload(result)
    assert payload["code"] == -1
    assert payload["details"]["blockers"]  # 如实报 blockers
    # 校验未过：绝不 approve/apply/publish
    assert "publish" not in prop.calls
    assert prop.calls == ["create_proposal", "update_spec", "validate"]


# --- --publish --yes（validated）→ 完整 approve→apply→publish ----------------------

def test_onboard_publish_with_yes_runs_full_chain(runner, patch_ctx):
    prop = _ProposalStub(validate_status="validated")
    patch_ctx(_wire(prop))
    result = runner.invoke(cli, _BASE_ARGS + ["--publish", "--yes"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["publish_status"] == "published"
    assert data["release_id"] == "rel_onb"
    assert prop.calls == [
        "create_proposal", "update_spec", "validate", "approve", "apply", "publish",
    ]
