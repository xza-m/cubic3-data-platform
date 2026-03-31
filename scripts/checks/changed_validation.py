#!/usr/bin/env python3
"""根据变更文件检测应运行的统一验证入口。"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_FILE = REPO_ROOT / "scripts" / "verify_rules.json"


@dataclass(frozen=True)
class Rule:
    name: str
    kind: str
    description: str
    patterns: tuple[str, ...]
    targets: tuple[str, ...]


def load_rules(path: Path) -> tuple[list[Rule], str, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rules = [
        Rule(
            name=item["name"],
            kind=item["kind"],
            description=item.get("description", ""),
            patterns=tuple(item["patterns"]),
            targets=tuple(item["targets"]),
        )
        for item in data["rules"]
    ]
    return rules, data["default_target"], data.get("target_order", [])


def normalize_path(raw_path: str) -> str:
    path = raw_path.strip().replace("\\", "/")
    while path.startswith("./"):
        path = path[2:]
    return path


def parse_porcelain_line(line: str) -> str | None:
    if not line:
        return None
    payload = line[3:]
    if " -> " in payload:
        payload = payload.split(" -> ", 1)[1]
    return normalize_path(payload.strip().strip('"'))


def get_changed_files() -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    tracked = [normalize_path(line) for line in result.stdout.splitlines() if normalize_path(line)]

    untracked_result = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    untracked = [normalize_path(line) for line in untracked_result.stdout.splitlines() if normalize_path(line)]
    return dedupe([*tracked, *untracked])


def get_files_from_base(base_ref: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMR", f"{base_ref}...HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return dedupe(normalize_path(line) for line in result.stdout.splitlines() if normalize_path(line))


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def matches(path: str, patterns: Iterable[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def reduce_targets(targets: set[str], target_order: list[str]) -> list[str]:
    reduced = set(targets)
    if "verify-semantic" in reduced:
        reduced.discard("verify-backend")
        reduced.discard("verify-frontend")
    if "verify" in reduced:
        reduced.discard("verify-backend")
        reduced.discard("verify-frontend")

    order_index = {target: index for index, target in enumerate(target_order)}
    return sorted(reduced, key=lambda item: (order_index.get(item, len(order_index)), item))


def detect(paths: list[str], rules: list[Rule], default_target: str, target_order: list[str]) -> dict[str, object]:
    normalized_paths = dedupe(normalize_path(path) for path in paths if normalize_path(path))
    matches_by_rule: dict[str, dict[str, object]] = {}
    file_kinds: dict[str, set[str]] = {path: set() for path in normalized_paths}

    for rule in rules:
        matched_files = [path for path in normalized_paths if matches(path, rule.patterns)]
        if not matched_files:
            continue
        matches_by_rule[rule.name] = {
            "kind": rule.kind,
            "description": rule.description,
            "targets": list(rule.targets),
            "files": matched_files,
        }
        for path in matched_files:
            file_kinds[path].add(rule.kind)

    unmatched_files = [path for path, kinds in file_kinds.items() if not kinds]
    raw_targets: set[str] = set()
    reasons: list[str] = []

    for match_info in matches_by_rule.values():
        raw_targets.update(match_info["targets"])  # type: ignore[arg-type]

    if unmatched_files:
        raw_targets.add(default_target)
        reasons.append("存在未命中规则的文件，已升级到仓库级 make verify")

    if any("repo" in kinds for kinds in file_kinds.values()):
        raw_targets.add("verify")
        reasons.append("命中仓库级规则，已升级到仓库级 make verify")

    has_nonsemantic_frontend = any(
        "frontend" in kinds and "semantic" not in kinds for kinds in file_kinds.values()
    )
    has_nonsemantic_backend = any(
        "backend" in kinds and "semantic" not in kinds for kinds in file_kinds.values()
    )
    if has_nonsemantic_frontend and has_nonsemantic_backend:
        raw_targets.add("verify")
        reasons.append("同时命中非语义前后端改动，已升级到仓库级 make verify")

    targets = reduce_targets(raw_targets, target_order)
    return {
        "files": normalized_paths,
        "matched_rules": matches_by_rule,
        "unmatched_files": unmatched_files,
        "recommended_targets": targets,
        "reasons": dedupe(reasons),
    }


def format_text(result: dict[str, object], source_label: str) -> str:
    lines = [f"变更来源: {source_label}"]
    files = result["files"]
    if not files:
        lines.append("未检测到变更文件。")
        return "\n".join(lines)

    lines.append("检测文件:")
    for path in files:  # type: ignore[assignment]
        lines.append(f"- {path}")

    matched_rules = result["matched_rules"]
    if matched_rules:
        lines.append("")
        lines.append("命中规则:")
        for name, info in matched_rules.items():  # type: ignore[assignment]
            description = info["description"]
            targets = ", ".join(f"make {target}" for target in info["targets"])
            lines.append(f"- {name}: {description} -> {targets}")
            for path in info["files"]:
                lines.append(f"  - {path}")

    unmatched_files = result["unmatched_files"]
    if unmatched_files:
        lines.append("")
        lines.append("未命中规则的文件:")
        for path in unmatched_files:  # type: ignore[assignment]
            lines.append(f"- {path}")

    reasons = result["reasons"]
    if reasons:
        lines.append("")
        lines.append("升级原因:")
        for reason in reasons:  # type: ignore[assignment]
            lines.append(f"- {reason}")

    lines.append("")
    lines.append("推荐执行目标:")
    targets = result["recommended_targets"]
    if targets:
        for target in targets:  # type: ignore[assignment]
            lines.append(f"- make {target}")
    else:
        lines.append("- 无需执行统一交付入口")
    return "\n".join(lines)


def execute_targets(targets: list[str]) -> int:
    if not targets:
        print("没有需要执行的统一交付入口。", flush=True)
        return 0

    print("开始执行统一交付入口:", flush=True)
    for target in targets:
        print(f"- make {target}", flush=True)
        completed = subprocess.run(["make", target], cwd=REPO_ROOT)
        if completed.returncode != 0:
            return completed.returncode
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="根据变更文件检测推荐的统一验证入口")
    parser.add_argument("paths", nargs="*", help="显式传入要检测的文件路径；为空时使用当前 git 变更")
    parser.add_argument("--base-ref", help="显式提供 diff 基线，例如 main、origin/main 或某个提交 SHA")
    parser.add_argument("--worktree", action="store_true", help="显式使用当前工作区相对 HEAD 的变更")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出检测结果")
    parser.add_argument("--execute", action="store_true", help="按推荐目标顺序直接执行 make verify-*")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    rules, default_target, target_order = load_rules(RULES_FILE)
    if args.paths:
        files = [normalize_path(path) for path in args.paths]
        source_label = "显式文件列表"
    elif args.base_ref:
        files = get_files_from_base(args.base_ref)
        source_label = f"git diff {args.base_ref}...HEAD"
    elif args.worktree:
        files = get_changed_files()
        source_label = "git diff HEAD + untracked"
    else:
        parser.error("请提供显式文件列表，或使用 --base-ref / --worktree 指定本次任务 diff")

    result = detect(files, rules, default_target, target_order)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_text(result, source_label))
    sys.stdout.flush()

    if args.execute:
        return execute_targets(result["recommended_targets"])  # type: ignore[arg-type]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
