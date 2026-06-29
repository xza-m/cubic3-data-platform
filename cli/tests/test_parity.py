"""双路 CLI parity 守卫（D4-①）：断言 cubic3-dp 命令树 + 输出契约符合统一词汇约定。

背景：semctl(in-process) 与 cubic3-dp(http-client) 是两套代码，D1 评审揪出的 bug 几乎都是两边
漂移（items_key/envelope/退出码不一致）。此测试把"统一命令词汇 + 输出契约"固化为断言，cubic3-dp
任一处漂移即红。契约来源 docs/architecture/dual-path-cli-design.md §5；semctl 侧命令由
tests/unit/interfaces/cli/ 守。

PARITY CONTRACT —— 改命令词汇时，semctl 与 cubic3-dp 必须同步，并更新此处。
"""
from __future__ import annotations

import json

from typer.main import get_command
from typer.testing import CliRunner

from cubic3_dp_cli import envelope
from cubic3_dp_cli.app import app

runner = CliRunner()

_ONTOLOGY_KINDS = ["object", "property", "metric", "glossary", "relation", "action", "policy"]

# T1 读/查询/调试：两入口（semctl + cubic3-dp）都必须有，同名
EXPECTED_T1 = {
    "datasource list", "datasource show",
    "asset list", "asset show", "asset fields", "asset evidence",
    "cube list", "cube show", "cube describe",
    "view list", "view show", "view describe",
    "manifest show",
    "query compile", "query plan", "query explain",
    "intent route", "intent extract", "intent answerability",
    "chat observe",
    "release list", "release show",
    *{f"ontology {k} {v}" for k in _ONTOLOGY_KINDS for v in ("list", "show", "status")},
}

# 写域：cubic3-dp 以 local_only stub 形式存在（真实执行走 semctl）
EXPECTED_WRITE_STUBS = {
    "cube draft", "cube create", "cube update",
    "release rollback",
    *{f"proposal {s}" for s in
      ("create", "confirm-source", "update-spec", "draft", "validate", "gap", "approve", "apply", "publish")},
    *{f"ontology {k} {v}" for k in _ONTOLOGY_KINDS for v in ("upsert", "publish")},
}


def _leaf_paths(cmd, prefix: str = "") -> set:
    """递归收集所有叶子命令路径，如 'ontology object status'。"""
    paths: set = set()
    sub = getattr(cmd, "commands", None)
    if sub:
        for name, child in sub.items():
            path = f"{prefix}{name}".strip()
            grandchild = _leaf_paths(child, prefix=f"{path} ")
            paths |= grandchild if grandchild else {path}
    return paths


_ALL_PATHS = _leaf_paths(get_command(app))


def test_t1_vocabulary_present():
    missing = EXPECTED_T1 - _ALL_PATHS
    assert not missing, f"cubic3-dp 缺 T1 命令（与契约/ semctl 漂移）：{sorted(missing)}"


def test_write_stubs_present():
    missing = EXPECTED_WRITE_STUBS - _ALL_PATHS
    assert not missing, f"cubic3-dp 缺写域 local_only stub：{sorted(missing)}"


def test_write_commands_are_local_only():
    # 抽样核心写命令：必须 local_only（不真写）+ exit 2
    for cmd in (["proposal", "publish"], ["cube", "create"], ["release", "rollback"], ["ontology", "metric", "upsert"]):
        res = runner.invoke(app, cmd)
        assert res.exit_code == 2, f"{cmd} 应 local_only exit 2，实得 {res.exit_code}"
        payload = json.loads(res.stdout)
        assert payload.get("code") == -1 and payload["data"]["local_only"] is True


def test_no_legacy_semantic_group():
    # 旧 semantic 命令组已删，不应复活
    assert "semantic" not in {p.split()[0] for p in _ALL_PATHS}


def _options_for(path: str) -> set:
    node = get_command(app)
    for part in path.split():
        node = node.commands[part]
    return {opt for p in node.params for opt in getattr(p, "opts", []) if opt.startswith("--")}


# 带语义参数的命令两路必须暴露同名 option（防"同名命令、参数漂移"——parity 仅命令名时漏检的根）
RUNTIME_MODE_COMMANDS = {"query plan", "query explain", "intent route", "intent extract", "intent answerability"}


def test_runtime_mode_commands_expose_option():
    for cmd in RUNTIME_MODE_COMMANDS:
        assert "--runtime-mode" in _options_for(cmd), f"{cmd} 缺 --runtime-mode（与 semctl 漂移）"


def test_query_compile_takes_positional_dsl():
    # 两路 query compile 入参形态一致：位置参，不是 --dsl 选项
    assert "--dsl" not in _options_for("query compile")


def test_output_contract_exit_codes_canonical():
    # 退出码契约与 semctl 一致：0/1/2/4/5
    assert (
        envelope.EXIT_OK, envelope.EXIT_ERROR, envelope.EXIT_USAGE,
        envelope.EXIT_NOT_FOUND, envelope.EXIT_NOT_READY,
    ) == (0, 1, 2, 4, 5)


def test_describe_lists_only_known_groups():
    # describe 自描述目录的命令 id 前缀都应是已注册的命令组（防 describe 与实际漂移）
    res = runner.invoke(app, ["describe"])
    assert res.exit_code == 0
    groups = {p.split()[0] for p in _ALL_PATHS} | {"auth"}  # auth 也注册
    for cmd in json.loads(res.stdout)["data"]["commands"]:
        assert cmd["id"].split(".")[0] in groups, f"describe 列了未注册组：{cmd['id']}"
