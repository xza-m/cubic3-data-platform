"""双路 CLI parity 守卫（semctl 侧）：断言 semctl 命令树符合统一词汇契约 + 输出契约。

与 cubic3-dp 侧 cli/tests/test_parity.py 共同守住两套 CLI 不漂移。
PARITY CONTRACT —— EXPECTED_T1 必须与 cubic3-dp 侧保持一致；改命令词汇时两处同步更新。
契约来源 docs/architecture/dual-path-cli-design.md §5。
"""
from __future__ import annotations

from app.interfaces.cli import output
from app.interfaces.cli.root import cli

_ONTOLOGY_KINDS = ["object", "property", "metric", "glossary", "relation", "action", "policy"]

# T1 读/查询/调试：与 cubic3-dp 侧 EXPECTED_T1 必须一致
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

# 写域：semctl 是真实命令（cubic3-dp 侧是 local_only stub）
EXPECTED_WRITE = {
    "cube draft", "cube create", "cube update",
    "release rollback",
    *{f"proposal {s}" for s in
      ("create", "confirm-source", "update-spec", "draft", "validate", "gap", "approve", "apply", "publish")},
    *{f"ontology {k} {v}" for k in _ONTOLOGY_KINDS for v in ("upsert", "publish")},
}


def _leaf_paths(cmd, prefix: str = "") -> set:
    paths: set = set()
    sub = getattr(cmd, "commands", None)
    if sub:
        for name, child in sub.items():
            path = f"{prefix}{name}".strip()
            grandchild = _leaf_paths(child, prefix=f"{path} ")
            paths |= grandchild if grandchild else {path}
    return paths


_ALL_PATHS = _leaf_paths(cli)


def test_t1_vocabulary_present():
    missing = EXPECTED_T1 - _ALL_PATHS
    assert not missing, f"semctl 缺 T1 命令（与契约/cubic3-dp 漂移）：{sorted(missing)}"


def test_write_commands_present():
    missing = EXPECTED_WRITE - _ALL_PATHS
    assert not missing, f"semctl 缺写域命令：{sorted(missing)}"


def test_output_contract_exit_codes_canonical():
    assert (
        output.EXIT_OK, output.EXIT_ERROR, output.EXIT_USAGE,
        output.EXIT_NOT_FOUND, output.EXIT_NOT_READY,
    ) == (0, 1, 2, 4, 5)
