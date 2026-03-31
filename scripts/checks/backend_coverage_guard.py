#!/usr/bin/env python3
"""检查后端 coverage 的总门槛、模块均匀度和核心模块守护约束。"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_COVERAGE_FILE = REPO_ROOT / "coverage.xml"
DEFAULT_RULES_FILE = REPO_ROOT / "scripts" / "backend_coverage_rules.json"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查后端 coverage 守护约束")
    parser.add_argument("--coverage-file", default=str(DEFAULT_COVERAGE_FILE), help="coverage.xml 路径")
    parser.add_argument("--rules-file", default=str(DEFAULT_RULES_FILE), help="coverage 规则 JSON 路径")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    return parser.parse_args(argv)


def load_rules(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _iter_package_lines(package_node: ET.Element) -> tuple[int, int]:
    total = 0
    hit = 0
    for cls in package_node.find("classes").findall("class"):
        for line in cls.find("lines").findall("line"):
            total += 1
            if int(line.attrib["hits"]) > 0:
                hit += 1
    return total, hit


def collect_rates(path: Path) -> tuple[float, dict[str, float]]:
    root = ET.parse(path).getroot()
    module_lines: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    total_lines = int(root.attrib.get("lines-valid", "0"))
    total_hits = int(root.attrib.get("lines-covered", "0"))

    for package_node in root.find("packages").findall("package"):
        package_name = package_node.attrib["name"]
        if package_name == ".":
            continue
        parts = package_name.split(".")
        module_name = ".".join(parts[:2]) if len(parts) >= 2 else parts[0]
        package_total, package_hit = _iter_package_lines(package_node)
        if package_total == 0:
            continue
        module_lines[module_name][0] += package_total
        module_lines[module_name][1] += package_hit

    total_rate = round((total_hits / total_lines) * 100, 2) if total_lines else 100.0
    module_rates = {
        module_name: round((hits / total) * 100, 2)
        for module_name, (total, hits) in sorted(module_lines.items())
        if total
    }
    return total_rate, module_rates


def evaluate(total_rate: float, module_rates: dict[str, float], rules: dict[str, object]) -> dict[str, object]:
    total_threshold = float(rules["total_threshold"])
    module_threshold = float(rules.get("module_threshold", rules.get("second_level_threshold", 95.0)))
    core_modules: dict[str, float] = {name: float(value) for name, value in rules.get("core_modules", {}).items()}

    errors: list[str] = []
    second_level_failures: list[dict[str, object]] = []
    core_failures: list[dict[str, object]] = []

    if total_rate < total_threshold:
        errors.append(f"后端总覆盖率 {total_rate:.2f}% 低于门槛 {total_threshold:.2f}%")

    for module_name, module_rate in module_rates.items():
        if module_rate < module_threshold:
            second_level_failures.append(
                {"module": module_name, "actual_rate": module_rate, "required_rate": module_threshold}
            )
            errors.append(f"模块 {module_name} 覆盖率 {module_rate:.2f}% 低于统一门槛 {module_threshold:.2f}%")

    for module_name, required_rate in core_modules.items():
        actual_rate = module_rates.get(module_name)
        if actual_rate is None:
            core_failures.append({"module": module_name, "actual_rate": None, "required_rate": required_rate})
            errors.append(f"核心模块 {module_name} 未出现在 coverage.xml 中，无法证明其达到 {required_rate:.2f}%")
            continue
        if actual_rate < required_rate:
            core_failures.append(
                {"module": module_name, "actual_rate": actual_rate, "required_rate": required_rate}
            )
            errors.append(f"核心模块 {module_name} 覆盖率 {actual_rate:.2f}% 低于要求 {required_rate:.2f}%")

    return {
        "total_rate": total_rate,
        "total_threshold": total_threshold,
        "module_threshold": module_threshold,
        "module_rates": module_rates,
        "core_modules": core_modules,
        "second_level_failures": second_level_failures,
        "core_failures": core_failures,
        "errors": errors,
    }


def format_text(result: dict[str, object], coverage_file: Path) -> str:
    lines = [
        f"coverage 文件: {coverage_file.relative_to(REPO_ROOT) if coverage_file.is_relative_to(REPO_ROOT) else coverage_file}",
        f"后端总覆盖率: {result['total_rate']:.2f}%",
        f"总门槛: {result['total_threshold']:.2f}%",
        f"模块统一门槛: {result['module_threshold']:.2f}%",
        "",
    ]
    if result["errors"]:
        lines.append("失败原因:")
        for error in result["errors"]:
            lines.append(f"- {error}")
    else:
        lines.append("结论:")
        lines.append("- 后端 coverage 守护检查通过")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    coverage_file = Path(args.coverage_file)
    rules_file = Path(args.rules_file)

    if not coverage_file.exists():
        print(f"coverage 文件不存在: {coverage_file}", file=sys.stderr)
        return 2
    if not rules_file.exists():
        print(f"规则文件不存在: {rules_file}", file=sys.stderr)
        return 2

    rules = load_rules(rules_file)
    total_rate, module_rates = collect_rates(coverage_file)
    result = evaluate(total_rate, module_rates, rules)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_text(result, coverage_file))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
