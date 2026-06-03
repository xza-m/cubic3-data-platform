#!/usr/bin/env python3
"""守护 ADR-012 事实源命名边界，拦截高频口径漂移表达。"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCAN_ROOTS = (
    Path("README.md"),
    Path("docs"),
    Path("frontend/src/v2"),
)
SKIP_PREFIXES = (
    "docs/superpowers/plans/",
)
TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".json",
    ".md",
    ".py",
    ".ts",
    ".tsx",
}
ALLOW_CONTEXT_MARKERS = (
    "不要",
    "不得",
    "不应",
    "不把",
    "不新建",
    "避免",
    "改成",
    "改为",
    "replace",
    "deprecated",
)


@dataclass(frozen=True)
class Rule:
    phrase: str
    suggestion: str
    case_sensitive: bool = False


RULES = (
    Rule(
        phrase="data asset dataset",
        suggestion="不要新增 data asset dataset；使用平台 Dataset 或 Dataset 类型资产。",
    ),
    Rule(
        phrase="数据资产 Dataset",
        suggestion="不要混用数据资产和平台 Dataset；使用平台 Dataset 或 Dataset 类型资产。",
    ),
    Rule(
        phrase="来自 query_history",
        suggestion="查询来源应写为平台交互式查询 · query_histories。",
    ),
    Rule(
        phrase="首页查询代表 Gateway",
        suggestion="首页平台查询只代表 query_histories；正式问数应独立接 Gateway telemetry。",
    ),
)


def normalize_path(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def should_skip(path: Path) -> bool:
    rel = normalize_path(path)
    if any(rel.startswith(prefix) for prefix in SKIP_PREFIXES):
        return True
    if path.is_dir():
        return False
    return path.suffix not in TEXT_SUFFIXES


def iter_scan_files(paths: Iterable[Path]) -> list[Path]:
    files: list[Path] = []
    for raw_path in paths:
        path = raw_path if raw_path.is_absolute() else REPO_ROOT / raw_path
        if not path.exists():
            continue
        if path.is_file():
            if not should_skip(path):
                files.append(path)
            continue
        for child in path.rglob("*"):
            if child.is_file() and not should_skip(child):
                files.append(child)
    return sorted(files)


def line_is_allowed(line: str) -> bool:
    lowered = line.lower()
    return any(marker.lower() in lowered for marker in ALLOW_CONTEXT_MARKERS)


def line_matches(rule: Rule, line: str) -> bool:
    if rule.case_sensitive:
        return rule.phrase in line
    return rule.phrase.lower() in line.lower()


def scan(files: Iterable[Path]) -> list[str]:
    violations: list[str] = []
    for path in files:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_no, line in enumerate(lines, start=1):
            if line_is_allowed(line):
                continue
            for rule in RULES:
                if line_matches(rule, line):
                    violations.append(
                        f"{normalize_path(path)}:{line_no}: 命中 `{rule.phrase}`，{rule.suggestion}"
                    )
    return violations


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查 ADR-012 事实源命名口径。")
    parser.add_argument(
        "paths",
        nargs="*",
        help="可选扫描路径；默认扫描 README.md、docs、frontend/src/v2。",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    roots = [Path(item) for item in args.paths] if args.paths else list(DEFAULT_SCAN_ROOTS)
    files = iter_scan_files(roots)
    violations = scan(files)
    if violations:
        print("[fact-source-guard] 发现事实源口径漂移：", file=sys.stderr)
        for item in violations:
            print(f"- {item}", file=sys.stderr)
        return 1
    print(f"[fact-source-guard] 通过，共检查 {len(files)} 个文本文件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
