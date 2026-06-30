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

    def __init__(self, validate_status="validated", publish_raises=False):
        self.calls = []
        self._validate_status = validate_status
        self._publish_raises = publish_raises
        self.last_create_payload = None
        self.closed = []

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
        if self._publish_raises:
            raise RuntimeError("publish boom")
        return {"id": pid, "status": "published", "publish_result": {"release_id": "rel_onb"}}

    def close(self, pid, payload=None):
        self.calls.append("close")
        self.closed.append((pid, payload))
        return {"id": pid, "status": "closed"}


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
    # #15：dry-run 预览后清理 staged 提案，不留孤儿（close 被调、discarded=True）
    assert "close" in prop.calls
    assert data["discarded"] is True
    assert prop.calls == ["create_proposal", "update_spec", "validate", "close"]
    assert prop.closed and prop.closed[0][0] == "proposal_onb"
    assert prop.closed[0][1]["close_reason"] == "abandoned"


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

    def __init__(self, blocked_tables=(), publish_raises_tables=()):
        self._blocked = set(blocked_tables)
        self._publish_raises = set(publish_raises_tables)
        self.calls = []
        self.closed = []
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
        if table in self._publish_raises:
            raise RuntimeError(f"publish boom: {table}")
        return {"id": pid, "status": "published", "publish_result": {"release_id": f"rel_{table}"}}

    def close(self, pid, payload=None):
        self.calls.append("close")
        self.closed.append((pid, payload))
        return {"id": pid, "status": "closed"}


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
    # #15：批量 dry-run 也清理 staged 提案，不留孤儿（2 张均 close）
    assert prop.calls.count("close") == 2
    assert data["discarded_count"] == 2
    assert len(prop.closed) == 2


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


# === #11 batch --publish 半发布容错（单张 publish 失败只跳过、其余继续、anchor 在）===========

def test_onboard_batch_publish_one_fails_others_continue_anchor_kept(runner, patch_ctx):
    """3 表逐张发布，中间 t2 的 publish 抛异常 → t2 标记 published=False+error、t1/t3 仍发布、
    整批不中断、anchor_release_id 始终回传供手动回滚（#11 "单张失败只跳过"+半批失败可见可回滚）。"""
    prop = _BatchProposalStub(publish_raises_tables={"t2"})
    patch_ctx(_wire_batch(prop, known_tables={"t1", "t2", "t3"}, anchor="rel_anchor"))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "t1,t2,t3", "--publish", "--yes"])
    assert result.exit_code == 0  # 单张发布失败不让整批失败
    data = _payload(result)["data"]
    # t2 失败但 t1/t3 仍尝试并成功（失败不中断后续）
    assert prop.calls.count("publish") == 3
    assert data["published_count"] == 2
    assert data["failed_count"] == 1
    # 半批失败可见可回滚：anchor 在，per-table published/error 状态在
    assert data["anchor_release_id"] == "rel_anchor"
    tables = {it["table"]: it for it in data["items"]}
    assert tables["t1"]["published"] is True
    assert tables["t1"]["release_id"] == "rel_t1"
    assert tables["t2"]["published"] is False
    assert tables["t2"]["publish_status"] == "failed"
    assert "boom" in tables["t2"]["error"]
    assert tables["t3"]["published"] is True
    assert tables["t3"]["release_id"] == "rel_t3"
    # new_release_id 推进到最后成功发布的 t3（失败张不污染）
    assert data["new_release_id"] == "rel_t3"


# === #12 表名解析精确匹配（后缀撞名不取错表 / 多候选报歧义）=================================

class _SubstringAssetSvc:
    """模拟 list_tables ILIKE 子串搜索：keyword 命中所有"含该子串"的 qualified_name 候选。

    用于验证 _resolve_table_id 不再 endswith 子串撞名（orders 不该命中 back_orders）。
    catalog: {keyword: [qualified_name, ...]}；list_fields 回固定列（含 ds）。
    """

    def __init__(self, catalog):
        self._catalog = catalog

    def list_tables(self, *, keyword, **kw):
        items = [
            {"id": f"tbl::{qn}", "qualified_name": qn}
            for qn in self._catalog.get(keyword, [])
        ]
        return {"items": items, "total": len(items)}

    def list_fields(self, table_id):
        return {"items": [{"name": "answer_cnt", "type": "bigint"}, {"name": "ds", "type": "string"}], "total": 2}


def _wire_batch_assets(prop, asset_svc, anchor="rel_anchor"):
    return _container(
        data_asset_service=asset_svc,
        onboard_spec_builder=_onboard_builder(),
        semantic_modeling_proposal_service=prop,
        runtime_snapshot_service=_runtime_snapshot_svc(anchor),
    )


def test_onboard_batch_suffix_collision_does_not_build_wrong_table(runner, patch_ctx):
    """orders 的子串搜索带回 back_orders 噪声候选，但只有 odps.df.orders 表名段精确等于 orders
    → 取对表，不取首个 back_orders 建错表（#12）。"""
    prop = _BatchProposalStub()
    # 子串搜索把 back_orders 排前面，orders 在后——旧 endswith 会命中 back_orders 首个
    asset = _SubstringAssetSvc({"orders": ["odps.df.back_orders", "odps.df.orders"]})
    # _pid_table 用 payload.table，create 时 table=orders → proposal_orders
    patch_ctx(_wire_batch_assets(prop, asset))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "orders"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    tables = {it["table"]: it for it in data["items"]}
    # orders 被正确解析并建到 validated（没被 back_orders 撞名误跳过/误建）
    assert tables["orders"]["validate_status"] == "validated"


def test_onboard_batch_no_exact_match_skipped_not_wrong_table(runner, patch_ctx):
    """子串搜索只带回 back_orders（无表名段精确等于 orders）→ 标记 skipped(asset_not_found)，
    绝不退化为取 back_orders 建错表（#12 无精确匹配报错而非默默取首个）。"""
    prop = _BatchProposalStub()
    asset = _SubstringAssetSvc({"orders": ["odps.df.back_orders", "odps.df.orders_archive"]})
    patch_ctx(_wire_batch_assets(prop, asset))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "orders"])
    assert result.exit_code == 0
    tables = {it["table"]: it for it in _payload(result)["data"]["items"]}
    assert tables["orders"]["validate_status"] == "skipped"
    assert tables["orders"]["reason"] == "asset_not_found"
    assert "create_proposal" not in prop.calls  # 绝不建错表


def test_onboard_batch_ambiguous_table_marked_skipped(runner, patch_ctx):
    """多个表名段都精确等于 orders（跨 schema 同名）→ 标记 skipped(ambiguous_table)，
    报歧义而非默默取首个（#12）。"""
    prop = _BatchProposalStub()
    asset = _SubstringAssetSvc({"orders": ["odps.sales.orders", "odps.ops.orders"]})
    patch_ctx(_wire_batch_assets(prop, asset))
    result = runner.invoke(cli, _BATCH_BASE + ["--tables", "orders"])
    assert result.exit_code == 0
    tables = {it["table"]: it for it in _payload(result)["data"]["items"]}
    assert tables["orders"]["validate_status"] == "skipped"
    assert tables["orders"]["reason"] == "ambiguous_table"
    assert "create_proposal" not in prop.calls  # 歧义不建


# === #14 分区自动探测复用 FieldIdentifier.PARTITION_KEYWORDS（覆盖旧硬编码漏的列）===========

def test_onboard_auto_detects_event_date_partition(runner, patch_ctx):
    """列里有 event_date（含 date 子串）+ 不传 --partitions → 复用 PARTITION_KEYWORDS 子串匹配探到，
    旧硬编码 {ds,dt,pt,date} 精确集合漏掉（#14）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "event_date", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    assert capture["partitions"] == ["event_date"]
    assert _payload(result)["data"]["partitions_used"] == ["event_date"]


def test_onboard_auto_detects_chinese_riqi_partition(runner, patch_ctx):
    """列名为中文「日期」+ 不传 --partitions → PARTITION_KEYWORDS 含「日期」子串匹配探到（#14 旧集合漏）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "日期", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    assert capture["partitions"] == ["日期"]
    assert _payload(result)["data"]["partitions_used"] == ["日期"]


def test_onboard_auto_detects_stat_month_partition(runner, patch_ctx):
    """列里有 stat_month（含 month 子串）→ 探到（旧 {ds,dt,pt,date} 漏 month/year/week/hour 等，#14）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "stat_month", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    assert capture["partitions"] == ["stat_month"]


def test_onboard_auto_detects_pt_partition(runner, patch_ctx):
    """MaxCompute 惯例分区名 pt（PARTITION_KEYWORDS 未含，CLI 补回）→ 探到，不弱化旧能力（#14）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "pt", "type": "string"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    assert capture["partitions"] == ["pt"]


def test_onboard_token_match_avoids_substring_false_positive(runner, patch_ctx):
    """token 词边界匹配避免裸子串误命：grades(含 ds 子串)/receipt(含 pt 子串) 不被误判为分区列
    → partitions=None（旧精确集合也不会误命，token 匹配相对裸子串守住这条底线，#14）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "answer_cnt", "type": "bigint"},
        {"name": "grades", "type": "string"},      # 含 ds 子串但非分区
        {"name": "receipt_no", "type": "string"},  # 含 pt 子串但非分区
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    assert capture["partitions"] is None
    assert _payload(result)["data"]["partitions_used"] is None


# === #13 上游 sensitivity_level 透传进 column（list_fields 确返回该字段）======================

def test_onboard_passes_through_upstream_sensitivity_level(runner, patch_ctx):
    """上游 AssetField 已标 sensitivity_level=pii → _read_cached_columns 透传进 column，
    传给 build_onboard_spec（为 _detect 第①路保留信源；下游消费需 cube_modeling 流到 dimension，越界未改）。"""
    prop = _ProposalStub(validate_status="validated")
    capture = {}
    asset = _asset_svc([
        {"name": "student_id", "type": "string", "sensitivity_level": "pii"},
        {"name": "answer_cnt", "type": "bigint"},
    ])
    patch_ctx(_wire(prop, asset_svc=asset, builder=_onboard_builder(capture)))
    result = runner.invoke(cli, _BASE_ARGS)
    assert result.exit_code == 0
    cols = {c["name"]: c for c in capture["columns"]}
    assert cols["student_id"]["sensitivity_level"] == "pii"
    # 无上游标记的列不硬造 sensitivity_level（向前兼容）
    assert "sensitivity_level" not in cols["answer_cnt"]


# === #15 dry-run 清理失败降级（close 抛错 → discarded=False、preview 仍返回）==================

def test_onboard_dry_run_cleanup_failure_degrades_gracefully(runner, patch_ctx):
    """proposal 服务无 close 能力（桩抛 AttributeError）→ _discard_staged_proposal 吞掉、
    discarded=False、preview 仍正常返回（#15 清理失败降级，孤儿留存由 discarded 暴露）。"""
    class _NoCloseStub(_ProposalStub):
        def close(self, pid, payload=None):
            raise RuntimeError("no close capability")

    prop = _NoCloseStub(validate_status="validated")
    patch_ctx(_wire(prop))
    result = runner.invoke(cli, _BASE_ARGS + ["--publish", "--dry-run"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["dry_run"] is True
    assert data["discarded"] is False  # 清理失败如实暴露
    assert data["preview"]["will_publish"] is True  # preview 仍返回
