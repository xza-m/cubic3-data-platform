#!/usr/bin/env python3
# scripts/checks/route_parity.py
"""Route parity audit between legacy App.tsx and v2/routes.tsx.

Parses both React Router route files, extracts all <Route path="..."> definitions
(including nested path concatenation), and produces a JSON report of aligned,
legacy-only, v2-only, and renamed routes.

Usage:
    python scripts/checks/route_parity.py            # text report, exit 0
    python scripts/checks/route_parity.py --json      # JSON report, exit 0
    python scripts/checks/route_parity.py --fail-on-mismatch  # exit 1 on undeclared diff

No external dependencies — stdlib only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths (relative to repo root)
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent.parent
# After Round 3 cutover (2026-04-20), legacy App.tsx lives under src/legacy/.
LEGACY_FILE = ROOT / "frontend" / "src" / "legacy" / "App.tsx"
V2_FILE = ROOT / "frontend" / "src" / "v2" / "routes.tsx"

# ---------------------------------------------------------------------------
# Allowlists — declare every known difference so the script only alerts on
# truly unexpected mismatches.
# ---------------------------------------------------------------------------

# legacy path → v2 path  (structural rename / flatten / merge)
# After 2026-04-21 path realignment, most previous renames are now aligned.
# Only genuine unreachable legacy redirect routes remain here.
KNOWN_RENAMES: dict[str, str] = {
    "/queries/editor":    "/queries",    # legacy redirect → v2 workbench (index)
    "/queries/templates": "/queries/my", # legacy redirect → v2 my queries
}

# Legacy redirect routes that need equivalent redirect rules in v2 on cutover day
KNOWN_LEGACY_REDIRECTS: dict[str, str] = {
    "/semantic/canvas":              "/semantic/domains",
    "/semantic/devtools":            "/semantic/workbench",
    "/semantic/domains/:id/canvas":  "/semantic/domains/:id",
    "/semantic/ide":                 "/semantic/workbench",
    "/semantic/overview":            "/semantic/workbench",
    "/semantic/playground":          "/semantic/cubes",
    "/semantic/tools":               "/semantic/workbench",
    "/semantic/visual-model":        "/semantic/domains",
    "/semantic/visual-model/:id":    "/semantic/domains/:id",
}

# Legacy routes intentionally not ported to v2
KNOWN_LEGACY_ONLY: list[str] = [
    "/semantic/modeling",
]

# Genuine v2-only routes (demo detail pages not in legacy App.tsx, plus error pages)
KNOWN_V2_ONLY: list[str] = [
    "/config/channels/:id",
    "/config/roles",                # W3 P14 · 角色管理列表（legacy 仅有 /config/team）
    "/config/roles/:id",            # W3 P14 · 角色详情
    "/config/subscriptions/:id",
    "/config/users",                # W3 P14 · 用户管理列表
    "/config/users/:id",            # W3 P14 · 用户详情
    "/data-center/datasources/:id",
    "/executions/:id",
    "/extraction-tasks/:id",
    "/extraction/runs/:id",
    "/forbidden",
    "/not-found",
    "/queries/history/:id",
    "/queries/my/:id",
    "/queries/scheduled/:id",
    "/queries/scheduled/new",       # W3 主线 · ScheduledQuery 新建
    "/semantic/ontology/governance",
    "/semantic/ontology/metrics",
    "/semantic/ontology/objects",
    "/semantic/ontology/objects/:name",
    "/semantic/ontology/objects/new",
    "/semantic/ontology/relations",
    "/semantic/relations",          # W3 P6 · 关系画布（legacy 走 /semantic/canvas redirect）
    "/settings",  # P21 用户偏好设置页，v2 新增，legacy 无对应路由
]

# ---------------------------------------------------------------------------
# Route parser
# ---------------------------------------------------------------------------

def _join_paths(stack: list[str], segment: str) -> str:
    """Join parent path stack with current segment."""
    if segment and segment.startswith("/"):
        return segment
    parts: list[str] = []
    for s in stack:
        stripped = s.strip("/")
        if stripped:
            parts.append(stripped)
    if segment:
        stripped = segment.strip("/")
        if stripped:
            parts.append(stripped)
    return "/" + "/".join(parts) if parts else "/"


def extract_routes(filepath: str | Path) -> list[str]:
    """Parse a React Router TSX file and return sorted unique route paths."""
    content = Path(filepath).read_text(encoding="utf-8")

    # Strip JSX block comments to avoid false matches
    content = re.sub(r"\{/\*.*?\*/\}", "", content, flags=re.DOTALL)

    routes: list[str] = []
    path_stack: list[str] = []
    tag_stack: list[bool] = []  # True = pushed a path segment

    i = 0
    n = len(content)

    while i < n:
        # --- Handle </Route> ---
        if content[i : i + 8] == "</Route>":
            if tag_stack:
                pushed = tag_stack.pop()
                if pushed and path_stack:
                    path_stack.pop()
            i += 8
            continue

        # --- Handle <Route ... ---
        if content[i : i + 6] == "<Route":
            next_ch = content[i + 6] if i + 6 < n else ""
            if next_ch not in (" ", "\n", "\t", "\r", "/", ">"):
                i += 1
                continue

            # Scan to end of this JSX tag, tracking {}-depth to skip nested JSX
            j = i + 6
            brace_depth = 0
            in_string = False
            string_char = ""
            is_self_closing = False

            while j < n:
                ch = content[j]

                if in_string:
                    if ch == string_char and (j == 0 or content[j - 1] != "\\"):
                        in_string = False
                else:
                    if ch in ('"', "'", "`"):
                        in_string = True
                        string_char = ch
                    elif ch == "{":
                        brace_depth += 1
                    elif ch == "}":
                        brace_depth -= 1
                    elif brace_depth == 0:
                        if ch == "/" and j + 1 < n and content[j + 1] == ">":
                            is_self_closing = True
                            j += 2
                            break
                        if ch == ">":
                            is_self_closing = False
                            j += 1
                            break
                j += 1

            tag_text = content[i:j]

            # Extract attributes
            path_match = re.search(r'\bpath="([^"]*)"', tag_text)
            has_index = bool(re.search(r"\bindex\b", tag_text))
            has_element = bool(re.search(r"\belement\s*=", tag_text))

            route_path = path_match.group(1) if path_match else None

            # Record route if it renders something
            if has_element:
                if route_path is not None:
                    routes.append(_join_paths(path_stack, route_path))
                elif has_index:
                    routes.append(_join_paths(path_stack, ""))

            # Manage nesting stack
            if not is_self_closing:
                if route_path is not None:
                    path_stack.append(route_path)
                    tag_stack.append(True)
                else:
                    tag_stack.append(False)

            i = j
            continue

        i += 1

    return sorted(set(routes))


# ---------------------------------------------------------------------------
# Parity computation
# ---------------------------------------------------------------------------

def compute_parity(legacy: list[str], v2: list[str]) -> dict:
    legacy_set = set(legacy)
    v2_set = set(v2)

    common = sorted(legacy_set & v2_set)
    legacy_only_raw = sorted(legacy_set - v2_set)
    v2_only_raw = sorted(v2_set - legacy_set)

    # Build renames list from allowlist
    renames = []
    for lp in legacy_only_raw:
        if lp in KNOWN_RENAMES:
            renames.append({"legacy": lp, "v2": KNOWN_RENAMES[lp]})

    # Build redirects list
    redirects = []
    for lp in legacy_only_raw:
        if lp in KNOWN_LEGACY_REDIRECTS:
            redirects.append({"legacy": lp, "v2": KNOWN_LEGACY_REDIRECTS[lp]})

    # Compute explained sets
    explained_legacy = (
        set(KNOWN_RENAMES.keys())
        | set(KNOWN_LEGACY_REDIRECTS.keys())
        | set(KNOWN_LEGACY_ONLY)
    )
    rename_targets = set(KNOWN_RENAMES.values())
    redirect_targets = set(KNOWN_LEGACY_REDIRECTS.values())
    explained_v2 = rename_targets | redirect_targets | set(KNOWN_V2_ONLY)

    undeclared_legacy = [p for p in legacy_only_raw if p not in explained_legacy]
    undeclared_v2 = [p for p in v2_only_raw if p not in explained_v2]

    return {
        "legacy_count": len(legacy),
        "v2_count": len(v2),
        "common": common,
        "legacy_only": legacy_only_raw,
        "v2_only": v2_only_raw,
        "renames": renames,
        "redirects": redirects,
        "known_legacy_only": sorted(set(KNOWN_LEGACY_ONLY) & set(legacy_only_raw)),
        "known_v2_only": sorted(set(KNOWN_V2_ONLY) & set(v2_only_raw)),
        "undeclared_mismatches": {
            "legacy": undeclared_legacy,
            "v2": undeclared_v2,
        },
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_text_report(report: dict) -> None:
    print("=" * 60)
    print("Route Parity Report")
    print("=" * 60)
    print(f"Legacy routes : {report['legacy_count']}")
    print(f"V2 routes     : {report['v2_count']}")
    print(f"Common        : {len(report['common'])}")
    print(f"Legacy only   : {len(report['legacy_only'])}")
    print(f"V2 only       : {len(report['v2_only'])}")
    print(f"Renames       : {len(report['renames'])}")
    print(f"Redirects     : {len(report['redirects'])}")
    print()

    print("── Common (aligned) ──")
    for p in report["common"]:
        print(f"  ✅ {p}")
    print()

    print("── Renames (legacy → v2) ──")
    for r in report["renames"]:
        print(f"  ⚠  {r['legacy']}  →  {r['v2']}")
    print()

    print("── Redirects (install on cutover day) ──")
    for r in report["redirects"]:
        print(f"  🔁 {r['legacy']}  →  {r['v2']}")
    print()

    print("── Known legacy-only (dropped / deferred) ──")
    for p in report["known_legacy_only"]:
        print(f"  ❌ {p}")
    print()

    print("── Known v2-only (new features) ──")
    for p in report["known_v2_only"]:
        print(f"  🆕 {p}")
    print()

    undeclared = report["undeclared_mismatches"]
    total_undeclared = len(undeclared["legacy"]) + len(undeclared["v2"])
    if total_undeclared:
        print(f"⚠⚠  UNDECLARED MISMATCHES: {total_undeclared}  ⚠⚠")
        for p in undeclared["legacy"]:
            print(f"  ⚠ legacy-only, not in allowlist: {p}")
        for p in undeclared["v2"]:
            print(f"  ⚠ v2-only, not in allowlist: {p}")
    else:
        print("✅ All differences are declared in allowlists — no undeclared mismatches.")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audit route parity between legacy App.tsx and v2/routes.tsx"
    )
    parser.add_argument(
        "--json", action="store_true", help="Output JSON report instead of text"
    )
    parser.add_argument(
        "--fail-on-mismatch",
        action="store_true",
        help="Exit with code 1 if undeclared mismatches exist (CI gate)",
    )
    args = parser.parse_args()

    if not LEGACY_FILE.exists():
        print(f"ERROR: Legacy file not found: {LEGACY_FILE}", file=sys.stderr)
        sys.exit(2)
    if not V2_FILE.exists():
        print(f"ERROR: V2 file not found: {V2_FILE}", file=sys.stderr)
        sys.exit(2)

    legacy = extract_routes(LEGACY_FILE)
    v2 = extract_routes(V2_FILE)
    report = compute_parity(legacy, v2)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_text_report(report)

    undeclared = report["undeclared_mismatches"]
    if args.fail_on_mismatch and (undeclared["legacy"] or undeclared["v2"]):
        sys.exit(1)


if __name__ == "__main__":
    main()
