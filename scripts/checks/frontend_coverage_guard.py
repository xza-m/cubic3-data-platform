#!/usr/bin/env python3
"""检查前端 coverage 的总门槛与核心页面守护约束。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = REPO_ROOT / "frontend"
DEFAULT_SUMMARY_FILE = FRONTEND_ROOT / "coverage" / "coverage-summary.json"
DEFAULT_RULES_FILE = REPO_ROOT / "scripts" / "frontend_coverage_rules.json"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查前端 coverage 守护约束")
    parser.add_argument("--summary-file", default=str(DEFAULT_SUMMARY_FILE), help="coverage-summary.json 路径")
    parser.add_argument("--rules-file", default=str(DEFAULT_RULES_FILE), help="前端 coverage 规则 JSON 路径")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    return parser.parse_args(argv)


def load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_file_key(file_key: str) -> str:
    path = Path(file_key)
    if path.is_absolute():
        try:
            return str(path.relative_to(FRONTEND_ROOT))
        except ValueError:
            parts = path.parts
            if "frontend" in parts:
                index = parts.index("frontend")
                return Path(*parts[index + 1 :]).as_posix()
            return path.as_posix()
    return path.as_posix()


def collect_rates(summary: dict[str, object]) -> tuple[float, dict[str, float]]:
    total = summary["total"]  # type: ignore[index]
    total_rate = round(float(total["lines"]["pct"]), 2)  # type: ignore[index]
    file_rates: dict[str, float] = {}
    for file_key, stats in summary.items():
        if file_key == "total":
            continue
        normalized = normalize_file_key(str(file_key))
        file_rates[normalized] = round(float(stats["lines"]["pct"]), 2)  # type: ignore[index]
    return total_rate, file_rates


def evaluate(total_rate: float, file_rates: dict[str, float], rules: dict[str, object]) -> dict[str, object]:
    total_threshold = float(rules["total_threshold"])
    core_pages: dict[str, float] = {name: float(value) for name, value in rules.get("core_pages", {}).items()}

    errors: list[str] = []
    core_failures: list[dict[str, object]] = []

    if total_rate < total_threshold:
        errors.append(f"前端总覆盖率 {total_rate:.2f}% 低于门槛 {total_threshold:.2f}%")

    for page_path, required_rate in core_pages.items():
        actual_rate = file_rates.get(page_path)
        if actual_rate is None:
            core_failures.append({"file": page_path, "actual_rate": None, "required_rate": required_rate})
            errors.append(f"核心功能页 {page_path} 未出现在 coverage-summary.json 中，无法证明其达到 {required_rate:.2f}%")
            continue
        if actual_rate < required_rate:
            core_failures.append({"file": page_path, "actual_rate": actual_rate, "required_rate": required_rate})
            errors.append(f"核心功能页 {page_path} 覆盖率 {actual_rate:.2f}% 低于要求 {required_rate:.2f}%")

    return {
        "total_rate": total_rate,
        "total_threshold": total_threshold,
        "file_rates": file_rates,
        "core_pages": core_pages,
        "core_failures": core_failures,
        "errors": errors,
    }


def format_text(result: dict[str, object], summary_file: Path) -> str:
    lines = [
        f"coverage 摘要文件: {summary_file.relative_to(REPO_ROOT) if summary_file.is_relative_to(REPO_ROOT) else summary_file}",
        f"前端总覆盖率: {result['total_rate']:.2f}%",
        f"总门槛: {result['total_threshold']:.2f}%",
        "",
    ]
    if result["errors"]:
        lines.append("失败原因:")
        for error in result["errors"]:
            lines.append(f"- {error}")
    else:
        lines.append("结论:")
        lines.append("- 前端 coverage 守护检查通过")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    summary_file = Path(args.summary_file)
    rules_file = Path(args.rules_file)

    if not summary_file.exists():
        print(f"coverage 摘要文件不存在: {summary_file}", file=sys.stderr)
        return 2
    if not rules_file.exists():
        print(f"规则文件不存在: {rules_file}", file=sys.stderr)
        return 2

    summary = load_json(summary_file)
    rules = load_json(rules_file)
    total_rate, file_rates = collect_rates(summary)
    result = evaluate(total_rate, file_rates, rules)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_text(result, summary_file))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
