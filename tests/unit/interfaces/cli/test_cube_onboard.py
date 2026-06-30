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


def _asset_svc(items=None):
    """资产桩：默认仅 answer_cnt（无分区列）；可注入自定义 items 以测分区自动探测。"""
    rows = items if items is not None else [{"name": "answer_cnt", "type": "bigint"}]
    return types.SimpleNamespace(list_fields=lambda tid: {"items": rows, "total": len(rows)})


def _onboard_builder(capture=None):
    """onboard builder 桩：返回固定 _SPEC；capture(dict) 非空时记录 build_onboard_spec 入参。"""

    def _build(**kw):
        if capture is not None:
            capture.update(kw)
        return _SPEC

    return types.SimpleNamespace(build_onboard_spec=_build)


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


def _wire(prop, asset_svc=None, builder=None):
    return _container(
        data_asset_service=asset_svc or _asset_svc(),
        onboard_spec_builder=builder or _onboard_builder(),
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


# --- 分区自动探测（turnkey 省心，堵忘传 --partitions 的 footgun）---------------------

def test_onboard_auto_detects_ds_partition_when_not_given(runner, patch_ctx):
    """列里有 ds + 不传 --partitions → 自动探到 ds，传给 build_onboard_spec 且回显 partitions_used。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "ds", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)  # 不传 --partitions
    assert result.exit_code == 0
    # build_onboard_spec 实际收到 partitions=['ds']（自动探）
    assert capture["partitions"] == ["ds"]
    # 输出 partitions_used 让用户知情
    assert _payload(result)["data"]["partitions_used"] == ["ds"]


def test_onboard_no_partition_columns_yields_none(runner, patch_ctx):
    """列里无 ds/dt/pt/date + 不传 --partitions → partitions=None，不报错（无分区表正常建）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "school_name", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)  # 不传 --partitions
    assert result.exit_code == 0
    assert capture["partitions"] is None
    assert _payload(result)["data"]["partitions_used"] is None


def test_onboard_explicit_partitions_wins_over_auto(runner, patch_ctx):
    """显式 --partitions 即使列里有 ds 也以显式为准（不被自动探测覆盖）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "ds", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS + ["--partitions", "dt"])
    assert result.exit_code == 0
    assert capture["partitions"] == ["dt"]  # 显式 dt 优先，不被 ds 覆盖
    assert _payload(result)["data"]["partitions_used"] == ["dt"]


# === P2 批量 cube onboard-batch ====================================================

class _BatchAssetSvc:
    """批量资产桩：list_tables(keyword) 按表名命中 qualified_name，list_fields 回固定列（含 ds）。"""

    def __init__(self, known_tables):
        self._known = known_tables  # set[str]

    def list_tables(self, *, keyword, **kw):
        if keyword in self._known:
            qn = f"odps.df.{keyword}"
            return {"items": [{"id": f"tbl_{keyword}", "qualified_name": qn}], "total": 1}
        return {"items": [], "total": 0}

    def list_fields(self, table_id):
        return {"items": [{"name": "answer_cnt", "type": "bigint"}, {"name": "ds", "type": "string"}], "total": 2}


class _BatchProposalStub:
    """批量 proposal 桩：每表独立 proposal_id；blocked_tables 里的表 validate 返回 blocked。

    create_proposal 用 payload.table 派生 id；validate 据此判定该表 status。记录全局调用序列。
    """

    def __init__(self, blocked_tables=()):
        self._blocked = set(blocked_tables)
        self.calls = []
        self._pid_table = {}  # proposal_id -> table

    def create_proposal(self, payload):
        self.calls.append("create_proposal")
        table = payload["table"]
        pid = f"proposal_{table}"
        self._pid_table[pid] = table
        assert payload["source_mode"] == "agent_led"  # 批量也固定 agent_led
        return {"id": pid}

    def update_spec(self, pid, payload):
        self.calls.append("update_spec")
        return {"id": pid}

    def validate(self, pid):
        self.calls.append("validate")
        table = self._pid_table[pid]
        status = "blocked" if table in self._blocked else "validated"
        blockers = [{"code": "missing_grain"}] if status == "blocked" else []
        return {"id": pid, "status": status, "validation_matrix": {"blockers": blockers}}

    def approve(self, pid):
        self.calls.append("approve")
        return {"id": pid, "status": "approved"}

    def apply(self, pid):
        self.calls.append("apply")
        return {"id": pid, "status": "applied"}

    def publish(self, pid):
        self.calls.append("publish")
        table = self._pid_table[pid]
        return {"id": pid, "status": "published", "publish_result": {"release_id": f"rel_{table}"}}


def _runtime_snapshot_svc(release_id="rel_anchor"):
    return types.SimpleNamespace(get_active_manifest=lambda namespace="default": {"ok": True, "release_id": release_id})


def _wire_batch(prop, known_tables, anchor="rel_anchor"):
    return _container(
        data_asset_service=_BatchAssetSvc(set(known_tables)),
        onboard_spec_builder=_onboard_builder(),
        semantic_modeling_proposal_service=prop,
        runtime_snapshot_service=_runtime_snapshot_svc(anchor),
    )


_BATCH_BASE = ["cube", "onboard-batch", "--source-id", "1", "--database", "df"]


def test_onboard_batch_no_publish_all_validated(runner, patch_ctx):
    """2 表全 validated + 无 --publish → per-table 概况，停 validated，绝不发布。"""
    prop = _BatchProposalStub()
    patch_ctx(_wire_batch(prop, known_tables={"t1", "t2"}))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,t2"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["total"] == 2
    tables = {it["table"]: it for it in data["items"]}
    assert tables["t1"]["validate_status"] == "validated"
    assert tables["t2"]["validate_status"] == "validated"
    # 自动探到 ds（批量始终自动探）
    assert tables["t1"]["partitions_used"] == ["ds"]
    assert "publish" not in prop.calls


def test_onboard_batch_publish_without_yes_is_usage_exit2(runner, patch_ctx):
    """--publish 缺 --yes → EXIT_USAGE(2)，不发布。"""
    prop = _BatchProposalStub()
    patch_ctx(_wire_batch(prop, known_tables={"t1", "t2"}))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,t2", "--publish"])
    assert result.exit_code == 2
    assert "publish" not in prop.calls


def test_onboard_batch_one_blocked_skips_rest_continue(runner, patch_ctx):
    """3 表其一 validate blocked → 该张标记跳过、其余继续（整批不中断）。"""
    prop = _BatchProposalStub(blocked_tables={"t2"})
    patch_ctx(_wire_batch(prop, known_tables={"t1", "t2", "t3"}))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,t2,t3"])
    assert result.exit_code == 0  # 单张失败不让整批失败
    data = _payload(result)["data"]
    tables = {it["table"]: it for it in data["items"]}
    assert tables["t1"]["validate_status"] == "validated"
    assert tables["t2"]["validate_status"] == "blocked"
    assert tables["t2"]["blockers"]  # 如实报 blockers
    assert tables["t3"]["validate_status"] == "validated"  # blocked 后仍继续建 t3


def test_onboard_batch_unknown_table_marked_skipped(runner, patch_ctx):
    """表名在资产里找不到 → 标记 skipped(asset_not_found)，不中断、不建。"""
    prop = _BatchProposalStub()
    patch_ctx(_wire_batch(prop, known_tables={"t1"}))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,nope"])
    assert result.exit_code == 0
    tables = {it["table"]: it for it in _payload(result)["data"]["items"]}
    assert tables["t1"]["validate_status"] == "validated"
    assert tables["nope"]["validate_status"] == "skipped"
    assert tables["nope"]["reason"] == "asset_not_found"


def test_onboard_batch_publish_dry_run_previews_with_anchor(runner, patch_ctx):
    """--publish --dry-run → 记锚点、预览整批、不发布。"""
    prop = _BatchProposalStub()
    patch_ctx(_wire_batch(prop, known_tables={"t1", "t2"}, anchor="rel_anchor"))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,t2", "--publish", "--dry-run"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["dry_run"] is True
    assert data["anchor_release_id"] == "rel_anchor"
    assert data["preview"]["will_publish_count"] == 2
    assert "publish" not in prop.calls


def test_onboard_batch_publish_with_yes_publishes_validated_only(runner, patch_ctx):
    """--publish --yes：只对 validated 的逐张 approve→apply→publish；blocked 的跳过不发。"""
    prop = _BatchProposalStub(blocked_tables={"t2"})
    patch_ctx(_wire_batch(prop, known_tables={"t1", "t2", "t3"}, anchor="rel_anchor"))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,t2,t3", "--publish", "--yes"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["anchor_release_id"] == "rel_anchor"
    assert data["published_count"] == 2  # t1 + t3，t2 被跳过
    assert prop.calls.count("publish") == 2
    tables = {it["table"]: it for it in data["items"]}
    assert tables["t1"]["release_id"] == "rel_t1"
    assert tables["t3"]["release_id"] == "rel_t3"
    assert "publish_status" not in tables["t2"]  # blocked 表无发布结果
    assert data["new_release_id"] == "rel_t3"  # 最后一张发布的 release
