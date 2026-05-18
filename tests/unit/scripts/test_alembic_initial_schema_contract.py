from __future__ import annotations

import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
VERSIONS_DIR = REPO_ROOT / "migrations" / "versions"


def _literal_assignment(module: ast.Module, name: str):
    for node in module.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name) and target.id == name:
                return ast.literal_eval(node.value)
    raise AssertionError(f"{name} assignment not found")


def test_production_release_uses_single_initial_alembic_revision():
    versions = sorted(path for path in VERSIONS_DIR.glob("*.py") if path.name != "__init__.py")

    initial = VERSIONS_DIR / "0001_initial_schema.py"
    assert initial in versions

    revisions: dict[str, object] = {}
    down_revisions: dict[str, object] = {}
    for version in versions:
        module = ast.parse(version.read_text(encoding="utf-8"))
        revision = _literal_assignment(module, "revision")
        revisions[str(revision)] = version.name
        down_revisions[str(revision)] = _literal_assignment(module, "down_revision")

    roots = sorted(revision for revision, down_revision in down_revisions.items() if down_revision is None)
    assert roots == ["0001_initial_schema"]
    assert "9decdbf913de" not in revisions

    source = initial.read_text(encoding="utf-8")
    module = ast.parse(source)
    assert _literal_assignment(module, "revision") == "0001_initial_schema"
    assert _literal_assignment(module, "down_revision") is None

    for table_name in (
        "data_sources",
        "datasets",
        "query_execution_jobs",
        "access_principals",
        "semantic_modeling_agent_sessions",
        "semantic_modeling_proposals",
    ):
        assert f'"{table_name}"' in source or f"'{table_name}'" in source
