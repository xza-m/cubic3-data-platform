#!/usr/bin/env python3
# scripts/checks/bundle_budget.py
"""
v2 前端 bundle 体积守护（W3）。

读取 frontend/dist-v2/assets/ 下的关键 chunk，按文件名前缀（hash 之前）匹配预算，
对超出预算者以非零退出码退出，便于 CI gate。

预算单位：字节（gzip 压缩后）。Brotli 不计入。

用法：
    python scripts/checks/bundle_budget.py
    python scripts/checks/bundle_budget.py --dist frontend/dist-v2 --json

预算定义在脚本顶部 BUDGETS 中，调整时同步评审 docs/superpowers/plans。
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIST = REPO_ROOT / "frontend" / "dist-v2"

# chunk 前缀 → 预算（字节，gzip 后）
# 命名约定：vite rollup 默认输出形如 `<name>-<hash>.js`，这里只比对短横线之前的部分。
# W5.D（2026-04-21）：W4 cutover 后 v2 实测 281KB，基线收紧到 350KB hard ceiling。
# 调整预算需要同步 W5 报告与 capacity 评估。
BUDGETS: dict[str, int] = {
    "index": 40_000,           # 主入口（实测 25KB · 60% headroom）
    "react-vendor": 90_000,    # react / react-dom / router（实测 78KB · 15% headroom）
    "query-vendor": 25_000,    # @tanstack/react-query（实测 15KB · 65% headroom）
    "icons": 30_000,           # lucide-react（manualChunks 命名）
    "semantic": 5_000,         # 语义域 chunk header（保留，目前未必产生）
}

# 任意未列入 BUDGETS 的 chunk 一旦超过该阈值即失败（防止隐式新增大 chunk）。
PER_CHUNK_DEFAULT_CAP = 30_000  # 30KB gzip

# 全局上限：所有 .js chunk gzip 体积之和不可超过该阈值。
# W5.D ceiling = 350KB（demo 1080p TTI 目标 ≤ 2.5s on 4G fast）。
TOTAL_BUDGET = 350_000


def gzip_size(path: Path) -> int:
    raw = path.read_bytes()
    return len(gzip.compress(raw, compresslevel=9))


# Vite 默认 chunk 文件名：`<name>-<hash>.js`。hash 自身可能包含 `-`（vite 用
# URL-safe base64，字符集 [A-Za-z0-9_-]），所以 `rsplit("-", 1)` 会在
# `react-vendor-ClMh-KQ4` 上误得到 `react-vendor-ClMh`，匹配不到 BUDGETS 的
# `react-vendor` key，进而被默认上限误杀。
#
# 正确做法：
#   1. 已知预算 key 优先匹配（最长前缀），这样 `react-vendor-XXX` 即使 hash 含
#      `-` 也能落到 `react-vendor`；
#   2. 兜底用 `rsplit("-", 1)` 去掉最后一段 hash（兼容 unit test 用的短 hash
#      `index-abc.js`），这是过去的行为。
_VITE_HASH_TAIL = re.compile(r"-[^-]+$")


def chunk_prefix(stem: str, known: Iterable[str] | None = None) -> str:
    """从 vite chunk 文件名 (不含 .js) 中提取业务名前缀。

    优先匹配 ``known`` 里的预算 key（最长前缀优先），匹配不到则剥掉末尾
    `-<hash>` 段。``known`` 缺省取模块级 ``BUDGETS.keys()``。

    >>> chunk_prefix("react-vendor-ClMh-KQ4", known={"react-vendor"})
    'react-vendor'
    >>> chunk_prefix("index-abc", known={"index"})
    'index'
    >>> chunk_prefix("totally-unknown-aaa", known={"index"})
    'totally-unknown'
    >>> chunk_prefix("DomainCanvas-yhZXA", known={"index"})
    'DomainCanvas'
    """
    keys = list(known) if known is not None else list(BUDGETS.keys())
    for key in sorted(keys, key=len, reverse=True):
        if stem == key or stem.startswith(key + "-"):
            return key
    return _VITE_HASH_TAIL.sub("", stem) or stem


def scan_chunks(dist: Path) -> list[tuple[str, Path, int]]:
    assets = dist / "assets"
    if not assets.is_dir():
        raise FileNotFoundError(f"assets 目录不存在: {assets}")
    out = []
    for p in sorted(assets.glob("*.js")):
        out.append((chunk_prefix(p.stem), p, gzip_size(p)))
    return out


def evaluate(chunks: Iterable[tuple[str, Path, int]]) -> tuple[list[dict], int, int]:
    rows = []
    total = 0
    failures = 0
    for prefix, path, size in chunks:
        budget = BUDGETS.get(prefix)
        status = "skip"
        if budget is not None:
            status = "pass" if size <= budget else "fail"
            if status == "fail":
                failures += 1
        elif size > PER_CHUNK_DEFAULT_CAP:
            # W5.D：未列入 BUDGETS 的 chunk 一旦超过默认上限即视为回归。
            budget = PER_CHUNK_DEFAULT_CAP
            status = "fail"
            failures += 1
        try:
            rel = str(path.relative_to(REPO_ROOT))
        except ValueError:
            rel = str(path)
        rows.append(
            {
                "prefix": prefix,
                "file": rel,
                "gzip": size,
                "budget": budget,
                "status": status,
            }
        )
        total += size
    return rows, total, failures


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="v2 前端 bundle 体积守护")
    p.add_argument("--dist", default=str(DEFAULT_DIST), help="dist-v2 目录")
    p.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    dist = Path(args.dist)
    chunks = scan_chunks(dist)
    rows, total, failures = evaluate(chunks)
    over_total = total > TOTAL_BUDGET

    if args.json:
        print(
            json.dumps(
                {
                    "total_gzip": total,
                    "total_budget": TOTAL_BUDGET,
                    "over_total": over_total,
                    "failures": failures,
                    "chunks": rows,
                },
                indent=2,
            )
        )
    else:
        print(f"[bundle-budget] dist={dist}")
        print(f"[bundle-budget] total gzip = {total} bytes (budget {TOTAL_BUDGET})")
        for r in rows:
            if r["budget"] is None:
                continue
            mark = "OK " if r["status"] == "pass" else "!! "
            print(
                f"  {mark}{r['prefix']:<20} {r['gzip']:>8}B / budget {r['budget']:>8}B"
            )
        if failures:
            print(f"[bundle-budget] {failures} chunk(s) over budget", file=sys.stderr)
        if over_total:
            print(
                f"[bundle-budget] total {total} > budget {TOTAL_BUDGET}",
                file=sys.stderr,
            )

    return 1 if (failures or over_total) else 0


if __name__ == "__main__":
    sys.exit(main())
