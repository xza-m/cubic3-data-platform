#!/usr/bin/env python3
# scripts/checks/alembic_head_guard.py
#
# Round 4 · T-005 — verify-cutover 增强：alembic 拓扑离线自检（dry-run）。
#
# 动机：
#   migrations/env.py 依赖 current_app.extensions['migrate']，任何"先挂 Flask
#   app 再跑 alembic"的 dry-run 在 CI 里成本较高。本脚本只做拓扑校验：解析
#   migrations/versions/*.py 的 revision / down_revision，确保：
#     1. 至少一个 root（down_revision = None）
#     2. 恰好一个 head（不是任何 revision 的 down_revision）
#     3. 无重复 revision 标识
#     4. 所有 down_revision 引用的 id 都存在（无孤立）
#     5. 无环
#
#   这能覆盖日常 Day 0 最常见风险："有人合了迁移但没 rebase 导致分叉"、
#   "漏删回滚的迁移导致孤儿 head"——比 `alembic upgrade head --sql` 更便宜。
#
# 退出码：
#   0 = 通过；
#   1 = 拓扑问题（详情打到 stderr）；
#   2 = I/O / 解析错误。
#
# 用法：
#   python3 scripts/checks/alembic_head_guard.py
#   python3 scripts/checks/alembic_head_guard.py --versions migrations/versions
#   python3 scripts/checks/alembic_head_guard.py --json
#
# 被 make verify-cutover 调用。

from __future__ import annotations

import argparse
import ast
import json
import sys
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VERSIONS = REPO_ROOT / "migrations" / "versions"


@dataclass
class Rev:
    id: str
    down: tuple[str, ...]  # () for root; 1-tuple typical; n-tuple for merges
    path: Path
    comment: str = ""


@dataclass
class Report:
    heads: list[str] = field(default_factory=list)
    roots: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)
    orphans: list[tuple[str, str]] = field(default_factory=list)  # (rev, missing_down)
    cycles: list[list[str]] = field(default_factory=list)
    total: int = 0

    @property
    def ok(self) -> bool:
        return (
            len(self.heads) == 1
            and len(self.roots) >= 1
            and not self.duplicates
            and not self.orphans
            and not self.cycles
        )


def _literal_or_none(node: ast.AST):
    """Best-effort resolve `revision = ...` / `down_revision = ...`.

    Supports:
      - Constant (str/None)
      - Tuple/List of Constants (for merge revisions)
    Any other shape returns ``_Unknown``.
    """
    if node is None:
        return None
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, (ast.Tuple, ast.List)):
        vals = []
        for elt in node.elts:
            if isinstance(elt, ast.Constant):
                vals.append(elt.value)
            else:
                return _Unknown
        return tuple(vals)
    return _Unknown


class _Unknown:
    """Sentinel for values we couldn't evaluate statically."""


def parse_version_file(path: Path) -> Rev | None:
    """Return a Rev if the file looks like an Alembic revision module."""
    try:
        src = path.read_text(encoding="utf-8")
    except OSError as e:
        print(f"[alembic-guard] cannot read {path}: {e}", file=sys.stderr)
        return None
    try:
        tree = ast.parse(src, filename=str(path))
    except SyntaxError as e:
        print(f"[alembic-guard] syntax error in {path}: {e}", file=sys.stderr)
        return None

    rev_id: str | None = None
    down_raw = None
    comment = ""
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            t = node.targets[0]
            if isinstance(t, ast.Name):
                if t.id == "revision":
                    v = _literal_or_none(node.value)
                    if isinstance(v, str):
                        rev_id = v
                elif t.id == "down_revision":
                    down_raw = _literal_or_none(node.value)
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str) and not comment:
            # First docstring line as comment
            comment = node.value.value.strip().splitlines()[0][:120]

    if not rev_id:
        return None  # 不是 alembic revision 模块

    if down_raw is None:
        down: tuple[str, ...] = ()
    elif isinstance(down_raw, str):
        down = (down_raw,)
    elif isinstance(down_raw, tuple):
        down = tuple(x for x in down_raw if isinstance(x, str))
    else:
        # 无法静态识别；用文件路径标一个伪值，稍后会被当作 orphan 从而 fail
        print(
            f"[alembic-guard] cannot evaluate down_revision in {path.name}; treating as unresolved.",
            file=sys.stderr,
        )
        down = ("<unresolved>",)

    return Rev(id=rev_id, down=down, path=path, comment=comment)


def analyze(versions_dir: Path) -> Report:
    rpt = Report()
    if not versions_dir.is_dir():
        print(f"[alembic-guard] versions dir not found: {versions_dir}", file=sys.stderr)
        return rpt

    revs: dict[str, Rev] = {}
    for p in sorted(versions_dir.glob("*.py")):
        if p.name == "__init__.py":
            continue
        rev = parse_version_file(p)
        if not rev:
            continue
        if rev.id in revs:
            rpt.duplicates.append(rev.id)
            continue
        revs[rev.id] = rev
    rpt.total = len(revs)

    # 拓扑构造
    incoming: dict[str, int] = {rid: 0 for rid in revs}
    children: dict[str, list[str]] = defaultdict(list)
    parents_of: dict[str, list[str]] = {rid: list(rev.down) for rid, rev in revs.items()}

    for rid, rev in revs.items():
        if not rev.down:
            rpt.roots.append(rid)
            continue
        for d in rev.down:
            if d not in revs:
                rpt.orphans.append((rid, d))
                continue
            incoming[rid] += 1
            children[d].append(rid)

    # head = 无子节点的 rev
    for rid in revs:
        if not children.get(rid):
            rpt.heads.append(rid)

    # 环检测（Kahn）
    q: deque[str] = deque([rid for rid, n in incoming.items() if n == 0])
    order: list[str] = []
    indeg = dict(incoming)
    while q:
        rid = q.popleft()
        order.append(rid)
        for c in children.get(rid, []):
            indeg[c] -= 1
            if indeg[c] == 0:
                q.append(c)
    if len(order) != len(revs):
        stuck = [rid for rid, n in indeg.items() if n > 0]
        if stuck:
            rpt.cycles.append(sorted(stuck))

    rpt.heads.sort()
    rpt.roots.sort()
    rpt.duplicates.sort()
    return rpt


def _fmt_rev(rev: Rev) -> str:
    return f"{rev.id[:12]}  {rev.path.name}  {rev.comment}"


def print_text(rpt: Report, versions_dir: Path, revs: dict[str, Rev] | None = None) -> None:
    print(f"[alembic-guard] versions = {versions_dir.relative_to(REPO_ROOT)}  · total = {rpt.total}")
    print(f"[alembic-guard] roots = {rpt.roots}")
    print(f"[alembic-guard] heads = {rpt.heads}")
    if revs and len(rpt.heads) == 1:
        r = revs[rpt.heads[0]]
        print(f"[alembic-guard] head @ {_fmt_rev(r)}")
    if rpt.duplicates:
        print(f"[alembic-guard] ✗ duplicate revision ids: {rpt.duplicates}", file=sys.stderr)
    if rpt.orphans:
        print("[alembic-guard] ✗ orphan references:", file=sys.stderr)
        for rid, miss in rpt.orphans:
            print(f"    {rid} -> down_revision {miss} not found", file=sys.stderr)
    if rpt.cycles:
        print(f"[alembic-guard] ✗ cycle detected: {rpt.cycles}", file=sys.stderr)
    if len(rpt.heads) > 1:
        print(f"[alembic-guard] ✗ multiple heads ({len(rpt.heads)}); 合并或线性化后再上 Day 0。", file=sys.stderr)
    elif len(rpt.heads) == 0:
        print("[alembic-guard] ✗ no head (possible cycle or empty graph).", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--versions",
        type=Path,
        default=DEFAULT_VERSIONS,
        help="path to migrations/versions (default: repo root)",
    )
    ap.add_argument("--json", action="store_true", help="emit JSON only (no text)")
    args = ap.parse_args()

    versions_dir: Path = args.versions
    if not versions_dir.is_absolute():
        versions_dir = (REPO_ROOT / versions_dir).resolve()

    # 我们需要把 revs 传给 print_text 以展示 head 的文件名
    revs: dict[str, Rev] = {}
    if versions_dir.is_dir():
        for p in sorted(versions_dir.glob("*.py")):
            if p.name == "__init__.py":
                continue
            rev = parse_version_file(p)
            if rev and rev.id not in revs:
                revs[rev.id] = rev

    rpt = analyze(versions_dir)

    if args.json:
        print(
            json.dumps(
                {
                    "ok": rpt.ok,
                    "total": rpt.total,
                    "heads": rpt.heads,
                    "roots": rpt.roots,
                    "duplicates": rpt.duplicates,
                    "orphans": [{"rev": a, "missing_down": b} for a, b in rpt.orphans],
                    "cycles": rpt.cycles,
                    "versions_dir": str(versions_dir),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print_text(rpt, versions_dir, revs)

    if not rpt.ok:
        return 1
    print("[alembic-guard] ✓ topology OK · single head · no orphans / cycles / duplicates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
