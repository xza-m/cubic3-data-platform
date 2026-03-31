import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "checks" / "changed_validation.py"


def run_detector(*paths: str) -> dict[str, object]:
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--json", *paths],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_requires_explicit_paths_or_base_ref():
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "VERIFY_FILES" not in result.stderr
    assert "--base-ref" in result.stderr


def test_docs_only_routes_to_verify_docs():
    result = run_detector("docs/quality/testing.md")
    assert result["recommended_targets"] == ["verify-docs"]


def test_semantic_change_routes_to_verify_semantic():
    result = run_detector("frontend/src/pages/Semantic/DevTools.tsx")
    assert result["recommended_targets"] == ["verify-semantic"]


def test_semantic_backend_api_routes_to_verify_semantic():
    result = run_detector("app/interfaces/api/v1/semantic.py")
    assert result["recommended_targets"] == ["verify-semantic"]


def test_cross_domain_nonsemantic_change_escalates_to_repo_verify():
    result = run_detector("frontend/src/App.tsx", "app/__init__.py")
    assert result["recommended_targets"] == ["verify"]


def test_docs_and_frontend_changes_keep_scoped_targets():
    result = run_detector("README.md", "frontend/src/App.tsx")
    assert result["recommended_targets"] == ["verify-frontend", "verify-docs"]


def test_unmatched_file_escalates_to_repo_verify():
    result = run_detector(".gitignore")
    assert result["recommended_targets"] == ["verify"]
