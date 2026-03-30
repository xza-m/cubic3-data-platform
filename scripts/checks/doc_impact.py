#!/usr/bin/env python3
"""检查本次变更是否遗漏应同步更新的关键文档。"""

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
RULES_FILE = REPO_ROOT / "scripts" / "doc_impact_rules.json"


@dataclass(frozen=True)
class BlockingRule:
    name: str
    description: str
    patterns: tuple[str, ...]
    required_any_docs: tuple[str, ...]


@dataclass(frozen=True)
class AdvisoryRule:
    name: str
    description: str
    patterns: tuple[str, ...]
    suggested_docs: tuple[str, ...]


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


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


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


def matches_any(path: str, patterns: Iterable[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def load_rules(path: Path) -> tuple[list[BlockingRule], list[AdvisoryRule]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    blocking_rules = [
        BlockingRule(
            name=item["name"],
            description=item["description"],
            patterns=tuple(item["patterns"]),
            required_any_docs=tuple(item["required_any_docs"]),
        )
        for item in data.get("blocking_rules", [])
    ]
    advisory_rules = [
        AdvisoryRule(
            name=item["name"],
            description=item["description"],
            patterns=tuple(item["patterns"]),
            suggested_docs=tuple(item["suggested_docs"]),
        )
        for item in data.get("advisory_rules", [])
    ]
    return blocking_rules, advisory_rules


def detect(
    paths: list[str], blocking_rules: list[BlockingRule], advisory_rules: list[AdvisoryRule]
) -> dict[str, object]:
    files = dedupe(normalize_path(path) for path in paths if normalize_path(path))
    changed_docs = {path for path in files if path.endswith(".md")}

    blocking_matches: list[dict[str, object]] = []
    advisory_matches: list[dict[str, object]] = []
    errors: list[str] = []
    warnings: list[str] = []

    for rule in blocking_rules:
        matched_files = [path for path in files if not path.endswith(".md") and matches_any(path, rule.patterns)]
        if not matched_files:
            continue
        touched_docs = [path for path in rule.required_any_docs if path in changed_docs]
        missing_docs = [path for path in rule.required_any_docs if path not in changed_docs]
        blocking_matches.append(
            {
                "name": rule.name,
                "description": rule.description,
                "matched_files": matched_files,
                "required_any_docs": list(rule.required_any_docs),
                "touched_docs": touched_docs,
                "missing_docs": missing_docs,
            }
        )
        if not touched_docs:
            errors.append(
                f"{rule.name}: 命中 {', '.join(matched_files)}，但未同步任何必需文档（至少更新 {', '.join(rule.required_any_docs)} 中的一项）"
            )

    for rule in advisory_rules:
        matched_files = [path for path in files if not path.endswith(".md") and matches_any(path, rule.patterns)]
        if not matched_files:
            continue
        touched_docs = [path for path in rule.suggested_docs if path in changed_docs]
        advisory_matches.append(
            {
                "name": rule.name,
                "description": rule.description,
                "matched_files": matched_files,
                "suggested_docs": list(rule.suggested_docs),
                "touched_docs": touched_docs,
            }
        )
        if not touched_docs:
            warnings.append(
                f"{rule.name}: 命中 {', '.join(matched_files)}，请人工确认是否需要同步 {', '.join(rule.suggested_docs)}"
            )

    return {
        "files": files,
        "changed_docs": sorted(changed_docs),
        "blocking_matches": blocking_matches,
        "advisory_matches": advisory_matches,
        "errors": errors,
        "warnings": warnings,
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

    changed_docs = result["changed_docs"]
    lines.append("")
    lines.append("本次已改动文档:")
    if changed_docs:
        for path in changed_docs:  # type: ignore[assignment]
            lines.append(f"- {path}")
    else:
        lines.append("- 无")

    if result["blocking_matches"]:
        lines.append("")
        lines.append("命中的强制规则:")
        for item in result["blocking_matches"]:  # type: ignore[assignment]
            lines.append(f"- {item['name']}: {item['description']}")
            lines.append(f"  - 命中文件: {', '.join(item['matched_files'])}")
            lines.append(f"  - 候选必需文档: {', '.join(item['required_any_docs'])}")
            if item["touched_docs"]:
                lines.append(f"  - 已同步文档: {', '.join(item['touched_docs'])}")
            else:
                lines.append("  - 已同步文档: 无")

    if result["advisory_matches"]:
        lines.append("")
        lines.append("命中的提示规则:")
        for item in result["advisory_matches"]:  # type: ignore[assignment]
            lines.append(f"- {item['name']}: {item['description']}")
            lines.append(f"  - 命中文件: {', '.join(item['matched_files'])}")
            lines.append(f"  - 建议检查: {', '.join(item['suggested_docs'])}")
            if item["touched_docs"]:
                lines.append(f"  - 已同步文档: {', '.join(item['touched_docs'])}")
            else:
                lines.append("  - 已同步文档: 无")

    if result["warnings"]:
        lines.append("")
        lines.append("提示:")
        for warning in result["warnings"]:  # type: ignore[assignment]
            lines.append(f"- {warning}")

    if result["errors"]:
        lines.append("")
        lines.append("失败原因:")
        for error in result["errors"]:  # type: ignore[assignment]
            lines.append(f"- {error}")

    lines.append("")
    lines.append("结论:")
    if result["errors"]:
        lines.append("- 文档影响检查失败")
    else:
        lines.append("- 文档影响检查通过")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="检查本次变更是否遗漏关键文档更新")
    parser.add_argument("paths", nargs="*", help="显式传入文件路径；为空时使用当前 git 变更")
    parser.add_argument("--base-ref", help="显式提供 diff 基线，例如 main、origin/main 或某个提交 SHA")
    parser.add_argument("--worktree", action="store_true", help="显式使用当前工作区相对 HEAD 的变更")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    blocking_rules, advisory_rules = load_rules(RULES_FILE)
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

    result = detect(files, blocking_rules, advisory_rules)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_text(result, source_label))

    if result["errors"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
