import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "checks" / "doc_impact.py"


def run_doc_impact(*paths: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--json", *paths],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def test_requires_explicit_paths_or_base_ref():
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "--base-ref" in result.stderr


def test_workflow_change_requires_doc_update():
    result = run_doc_impact("Makefile")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["errors"]


def test_workflow_change_passes_with_testing_doc():
    result = run_doc_impact("Makefile", "docs/quality/testing.md")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert not payload["errors"]


def test_architecture_boundary_only_warns():
    result = run_doc_impact("app/di/container.py")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert not payload["errors"]
    assert payload["warnings"]


def test_doc_only_change_passes():
    result = run_doc_impact("docs/quality/review.md")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert not payload["errors"]
