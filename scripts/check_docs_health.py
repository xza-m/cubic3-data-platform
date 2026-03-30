#!/usr/bin/env python3
"""检查知识库入口文档的本地 Markdown 链接和索引完整性。"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
FENCE_RE = re.compile(r"^(```|~~~)")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ALLOWED_DOC_TYPES = {
    "adr",
    "adr-index",
    "architecture-doc",
    "architecture-index",
    "archive-index",
    "baseline",
    "governance",
    "historical-note",
    "knowledge-base-index",
    "prd-index",
    "reference-index",
    "runbook",
    "sop",
}
ALLOWED_STATUS = {"archived", "current", "design", "maintained", "superseded"}
ALLOWED_SOURCE_OF_TRUTH = {"historical", "primary", "reference", "secondary"}

DEFAULT_INDEX_FILES = [
    Path("README.md"),
    Path("AGENTS.md"),
    Path("frontend/README.md"),
    Path("docs/readme.md"),
    Path("docs/quality/testing.md"),
    Path("docs/quality/review.md"),
    Path("docs/runbooks/local-dev.md"),
    Path("docs/KNOWLEDGE_BASE_GOVERNANCE.md"),
    Path("docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md"),
    Path("docs/architecture/README.md"),
    Path("docs/architecture/decisions/README.md"),
    Path("docs/prd/README.md"),
    Path("docs/archive/README.md"),
    Path("docs/archive/legacy/README.md"),
    Path("docs/archive/2026-01/README.md"),
    Path("docs/reference-design/README.md"),
]

EXPECTED_INDEX_TARGETS = {
    Path("docs/readme.md"): {
        Path("README.md"),
        Path("docs/TECH_STACK_AND_ARCHITECTURE.md"),
        Path("docs/QUICK_START.md"),
        Path("docs/STARTUP_GUIDE.md"),
        Path("docs/DOC_ALIGNMENT_REPORT.md"),
        Path("docs/quality/testing.md"),
        Path("docs/quality/review.md"),
        Path("docs/runbooks/local-dev.md"),
        Path("docs/architecture/README.md"),
        Path("docs/semantic_verification.md"),
        Path("docs/KNOWLEDGE_BASE_GOVERNANCE.md"),
        Path("docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md"),
        Path("docs/prd/README.md"),
        Path("docs/archive/README.md"),
        Path("docs/archive/legacy/README.md"),
        Path("docs/reference-design/README.md"),
        Path("frontend/README.md"),
    },
    Path("docs/prd/README.md"): {
        Path("docs/prd/app_center_prd.md"),
        Path("docs/prd/data_agent_prd.md"),
        Path("docs/prd/query_center_prd.md"),
        Path("docs/prd/semantic_layer_prd.md"),
        Path("docs/prd/universal_schema_browser_prd.md"),
    },
    Path("docs/archive/README.md"): {
        Path("docs/archive/2026-01/README.md"),
        Path("docs/archive/legacy/README.md"),
    },
    Path("docs/reference-design/README.md"): {
        Path("docs/reference-design/SEMANTIC_WORKBENCH_NOTES.md"),
    },
    Path("docs/architecture/README.md"): {
        Path("docs/architecture/system-overview.md"),
        Path("docs/architecture/backend.md"),
        Path("docs/architecture/frontend.md"),
        Path("docs/architecture/decisions/README.md"),
    },
    Path("docs/architecture/decisions/README.md"): {
        Path("docs/architecture/decisions/ADR-001-platform-baseline.md"),
        Path("docs/architecture/decisions/ADR-002-semantic-assets-in-yaml.md"),
        Path("docs/architecture/decisions/ADR-003-rq-for-tasks-and-events.md"),
        Path("docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md"),
        Path("docs/architecture/decisions/ADR-005-domain-oriented-api-boundary.md"),
        Path("docs/architecture/decisions/ADR-006-app-center-config-center-separation.md"),
    },
}

REQUIRED_METADATA_FILES = {
    Path("README.md"),
    Path("frontend/README.md"),
    Path("docs/readme.md"),
    Path("docs/quality/testing.md"),
    Path("docs/quality/review.md"),
    Path("docs/runbooks/local-dev.md"),
    Path("docs/TECH_STACK_AND_ARCHITECTURE.md"),
    Path("docs/QUICK_START.md"),
    Path("docs/STARTUP_GUIDE.md"),
    Path("docs/DOC_ALIGNMENT_REPORT.md"),
    Path("docs/semantic_verification.md"),
    Path("docs/KNOWLEDGE_BASE_GOVERNANCE.md"),
    Path("docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md"),
    Path("docs/architecture/README.md"),
    Path("docs/architecture/system-overview.md"),
    Path("docs/architecture/backend.md"),
    Path("docs/architecture/frontend.md"),
    Path("docs/architecture/decisions/README.md"),
    Path("docs/architecture/decisions/ADR-001-platform-baseline.md"),
    Path("docs/architecture/decisions/ADR-002-semantic-assets-in-yaml.md"),
    Path("docs/architecture/decisions/ADR-003-rq-for-tasks-and-events.md"),
    Path("docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md"),
    Path("docs/architecture/decisions/ADR-005-domain-oriented-api-boundary.md"),
    Path("docs/architecture/decisions/ADR-006-app-center-config-center-separation.md"),
    Path("docs/prd/README.md"),
    Path("docs/archive/README.md"),
    Path("docs/archive/legacy/README.md"),
    Path("docs/archive/2026-01/README.md"),
    Path("docs/reference-design/README.md"),
}

REQUIRED_METADATA_FIELDS = (
    "doc_type",
    "status",
    "source_of_truth",
    "owner",
    "last_reviewed",
)


@dataclass
class LinkIssue:
    source: Path
    target: str
    message: str


def parse_frontmatter(path: Path) -> dict[str, str] | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None

    _, _, remainder = text.partition("---\n")
    body, separator, _ = remainder.partition("\n---\n")
    if not separator:
        return None

    metadata: dict[str, str] = {}
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        metadata[key.strip()] = value.strip()
    return metadata


def slugify_heading(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[`*_~]", "", text)
    text = re.sub(r"[^\w\u4e00-\u9fff\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-")


def extract_headings(path: Path) -> set[str]:
    headings: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = HEADING_RE.match(line)
        if not match:
            continue
        heading = match.group(2).strip()
        if heading:
            headings.add(slugify_heading(heading))
    return headings


def iter_markdown_links(path: Path) -> Iterable[tuple[str, str]]:
    raw_text = path.read_text(encoding="utf-8")
    lines: list[str] = []
    in_fence = False
    for line in raw_text.splitlines():
        if FENCE_RE.match(line.strip()):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        lines.append(line)

    text = "\n".join(lines)
    for _, target in MARKDOWN_LINK_RE.findall(text):
        yield target.strip(), text


def resolve_target(source: Path, target: str) -> tuple[Path | None, str | None]:
    if target.startswith(("http://", "https://", "mailto:")):
        return None, None
    if "{" in target or "}" in target:
        return None, None

    if target.startswith("#"):
        return source, target[1:]

    file_part, _, anchor = target.partition("#")
    resolved = (source.parent / file_part).resolve()
    return resolved, anchor or None


def collect_files(scope: str) -> list[Path]:
    files = [REPO_ROOT / rel for rel in DEFAULT_INDEX_FILES]
    if scope == "all":
        files.extend(sorted((REPO_ROOT / "docs").rglob("*.md")))
    deduped: list[Path] = []
    seen: set[Path] = set()
    for path in files:
        if path not in seen and path.exists():
            deduped.append(path)
            seen.add(path)
    return deduped


def check_links(files: list[Path]) -> list[LinkIssue]:
    issues: list[LinkIssue] = []
    heading_cache: dict[Path, set[str]] = {}

    for source in files:
        for target, _ in iter_markdown_links(source):
            resolved, anchor = resolve_target(source, target)
            if resolved is None:
                continue
            if not resolved.exists():
                issues.append(
                    LinkIssue(
                        source=source.relative_to(REPO_ROOT),
                        target=target,
                        message=f"目标不存在: {target}",
                    )
                )
                continue
            if resolved.is_dir():
                issues.append(
                    LinkIssue(
                        source=source.relative_to(REPO_ROOT),
                        target=target,
                        message=f"不检查目录链接，请改为明确文件: {target}",
                    )
                )
                continue
            if anchor:
                headings = heading_cache.setdefault(resolved, extract_headings(resolved))
                if slugify_heading(anchor) not in headings:
                    issues.append(
                        LinkIssue(
                            source=source.relative_to(REPO_ROOT),
                            target=target,
                            message=f"锚点不存在: {target}",
                        )
                    )
    return issues


def collect_local_link_targets(path: Path) -> set[Path]:
    targets: set[Path] = set()
    for target, _ in iter_markdown_links(path):
        resolved, _ = resolve_target(path, target)
        if resolved is None or not resolved.exists() or resolved.is_dir():
            continue
        if resolved.suffix.lower() != ".md":
            continue
        targets.add(resolved.relative_to(REPO_ROOT))
    return targets


def check_index_coverage() -> list[str]:
    issues: list[str] = []
    for index_path, expected_targets in EXPECTED_INDEX_TARGETS.items():
        abs_index = REPO_ROOT / index_path
        actual_targets = collect_local_link_targets(abs_index)
        missing = sorted(expected_targets - actual_targets)
        for target in missing:
            issues.append(f"{index_path} 缺少索引链接: {target}")
    return issues


def check_metadata() -> list[str]:
    issues: list[str] = []
    for rel_path in sorted(REQUIRED_METADATA_FILES):
        abs_path = REPO_ROOT / rel_path
        if not abs_path.exists():
            issues.append(f"{rel_path} 缺少文件，无法检查元数据")
            continue
        metadata = parse_frontmatter(abs_path)
        if metadata is None:
            issues.append(f"{rel_path} 缺少 frontmatter")
            continue
        for field in REQUIRED_METADATA_FIELDS:
            if not metadata.get(field):
                issues.append(f"{rel_path} 缺少元数据字段: {field}")
        doc_type = metadata.get("doc_type")
        if doc_type and doc_type not in ALLOWED_DOC_TYPES:
            issues.append(f"{rel_path} 的 doc_type 非法: {doc_type}")
        status = metadata.get("status")
        if status and status not in ALLOWED_STATUS:
            issues.append(f"{rel_path} 的 status 非法: {status}")
        source_of_truth = metadata.get("source_of_truth")
        if source_of_truth and source_of_truth not in ALLOWED_SOURCE_OF_TRUTH:
            issues.append(f"{rel_path} 的 source_of_truth 非法: {source_of_truth}")
        if status == "superseded" and source_of_truth == "primary":
            issues.append(f"{rel_path} 不能同时标记为 superseded 和 source_of_truth: primary")
        if status == "superseded" and rel_path in DEFAULT_INDEX_FILES:
            issues.append(f"{rel_path} 已标记为 superseded，不应继续作为默认入口文档")
        reviewed = metadata.get("last_reviewed")
        if reviewed and not DATE_RE.match(reviewed):
            issues.append(f"{rel_path} 的 last_reviewed 格式非法: {reviewed}")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="检查知识库文档健康度")
    parser.add_argument(
        "--scope",
        choices=("baseline", "all"),
        default="baseline",
        help="baseline 只检查知识库入口文档；all 额外扫描 docs 下所有 Markdown 文件",
    )
    args = parser.parse_args()

    files = collect_files(args.scope)
    link_issues = check_links(files)
    coverage_issues = check_index_coverage()
    metadata_issues = check_metadata()

    if link_issues:
        print("链接检查失败：")
        for issue in link_issues:
            print(f"- {issue.source}: {issue.message}")

    if coverage_issues:
        print("索引检查失败：")
        for issue in coverage_issues:
            print(f"- {issue}")

    if metadata_issues:
        print("元数据检查失败：")
        for issue in metadata_issues:
            print(f"- {issue}")

    if link_issues or coverage_issues or metadata_issues:
        print(
            f"\n结果：失败，发现 {len(link_issues)} 个链接问题，"
            f"{len(coverage_issues)} 个索引问题，"
            f"{len(metadata_issues)} 个元数据问题。"
        )
        return 1

    print(f"结果：通过，共检查 {len(files)} 个 Markdown 文件。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
