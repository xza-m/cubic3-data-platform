import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "checks" / "frontend_coverage_guard.py"


def write_summary(path: Path, total_lines_pct: float, files: dict[str, float]) -> None:
    payload: dict[str, object] = {
        "total": {
            "lines": {"pct": total_lines_pct, "covered": 0, "total": 0},
            "statements": {"pct": total_lines_pct, "covered": 0, "total": 0},
            "functions": {"pct": total_lines_pct, "covered": 0, "total": 0},
            "branches": {"pct": total_lines_pct, "covered": 0, "total": 0},
        }
    }
    for rel_path, pct in files.items():
        payload[str(Path("/repo/frontend") / rel_path)] = {
            "lines": {"pct": pct, "covered": 0, "total": 0},
            "statements": {"pct": pct, "covered": 0, "total": 0},
            "functions": {"pct": pct, "covered": 0, "total": 0},
            "branches": {"pct": pct, "covered": 0, "total": 0},
        }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_rules(path: Path, *, total_threshold: float = 90.0, core_pages: dict[str, float] | None = None) -> None:
    payload = {
        "total_threshold": total_threshold,
        "core_pages": core_pages
        or {
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 100.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run_guard(summary_path: Path, rules_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--summary-file",
            str(summary_path),
            "--rules-file",
            str(rules_path),
            "--json",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def test_fails_when_total_coverage_below_threshold(tmp_path: Path):
    summary_path = tmp_path / "coverage-summary.json"
    rules_path = tmp_path / "rules.json"
    write_summary(
        summary_path,
        34.77,
        {
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 100.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    )
    write_rules(
        rules_path,
        core_pages={
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 100.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    )

    result = run_guard(summary_path, rules_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any("34.77%" in item for item in payload["errors"])


def test_fails_when_core_page_below_required_threshold(tmp_path: Path):
    summary_path = tmp_path / "coverage-summary.json"
    rules_path = tmp_path / "rules.json"
    write_summary(
        summary_path,
        91.0,
        {
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 91.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    )
    write_rules(
        rules_path,
        core_pages={
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 100.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    )

    result = run_guard(summary_path, rules_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any("src/pages/Dashboard.tsx" in item and "100.00%" in item for item in payload["errors"])


def test_passes_when_total_and_core_pages_meet_thresholds(tmp_path: Path):
    summary_path = tmp_path / "coverage-summary.json"
    rules_path = tmp_path / "rules.json"
    write_summary(
        summary_path,
        91.5,
        {
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 100.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    )
    write_rules(
        rules_path,
        core_pages={
            "src/pages/Login.tsx": 100.0,
            "src/pages/Dashboard.tsx": 100.0,
            "src/pages/Datasources.tsx": 100.0,
        },
    )

    result = run_guard(summary_path, rules_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["total_rate"] == 91.5
    assert payload["errors"] == []
