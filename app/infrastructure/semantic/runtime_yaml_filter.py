"""运行时 YAML 过滤规则。"""
from __future__ import annotations

from fnmatch import fnmatch
from pathlib import Path


RUNTIME_IGNORED_YAML_PATTERNS = (
    'qa_catalog_*.yml',
    'qa_cube_*.yml',
    'playwright_catalog_*.yml',
    'playwright_cube_*.yml',
    '*_draft_*.yml',
    'domain_qa_*.yml',
    'domain_playwright_*.yml',
    'domain_debug_*.yml',
    'domain_test*.yml',
    'domain_[0-9]*.yml',
)


def should_ignore_runtime_yaml(path: Path) -> bool:
    """过滤掉仅供 Playwright/调试使用的语义夹具。"""
    return any(fnmatch(path.name, pattern) for pattern in RUNTIME_IGNORED_YAML_PATTERNS)
