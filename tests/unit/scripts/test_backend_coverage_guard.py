import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "checks" / "backend_coverage_guard.py"


def write_coverage_xml(path: Path, packages: list[dict[str, object]]) -> None:
    package_chunks: list[str] = []
    total_lines = 0
    hit_lines = 0
    for package in packages:
        classes: list[dict[str, object]] = package["classes"]  # type: ignore[assignment]
        class_chunks: list[str] = []
        package_total = 0
        package_hit = 0
        for index, class_info in enumerate(classes, start=1):
            hits: list[int] = class_info["hits"]  # type: ignore[assignment]
            line_chunks: list[str] = []
            for lineno, hits_value in enumerate(hits, start=1):
                line_chunks.append(f'<line number="{lineno}" hits="{hits_value}"/>')
                package_total += 1
                if hits_value > 0:
                    package_hit += 1
            class_chunks.append(
                f'<class name="c{index}" filename="{class_info["filename"]}" line-rate="0" branch-rate="0" complexity="0">'
                f'<methods/>\n<lines>{"".join(line_chunks)}</lines></class>'
            )
        total_lines += package_total
        hit_lines += package_hit
        package_chunks.append(
            f'<package name="{package["name"]}" line-rate="0" branch-rate="0" complexity="0">'
            f'<classes>{"".join(class_chunks)}</classes></package>'
        )

    line_rate = hit_lines / total_lines if total_lines else 1.0
    xml = (
        '<?xml version="1.0" ?>'
        f'<coverage version="7.0" timestamp="0" lines-valid="{total_lines}" lines-covered="{hit_lines}" '
        f'line-rate="{line_rate:.4f}" branches-valid="0" branches-covered="0" branch-rate="0" complexity="0">'
        '<sources><source>.</source></sources>'
        f'<packages>{"".join(package_chunks)}</packages>'
        '</coverage>'
    )
    path.write_text(xml, encoding="utf-8")


def write_rules(path: Path, *, total_threshold: float = 95.0, second_level_threshold: float = 95.0) -> None:
    payload = {
        "total_threshold": total_threshold,
        "second_level_threshold": second_level_threshold,
        "core_modules": {
            "application.semantic": 100.0,
            "domain.semantic": 100.0,
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run_guard(coverage_path: Path, rules_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--coverage-file",
            str(coverage_path),
            "--rules-file",
            str(rules_path),
            "--json",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def test_fails_when_second_level_module_below_threshold(tmp_path: Path):
    coverage_path = tmp_path / "coverage.xml"
    rules_path = tmp_path / "rules.json"
    write_coverage_xml(
        coverage_path,
        [
            {
                "name": "application.semantic",
                "classes": [{"filename": "app/application/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
            {
                "name": "domain.semantic",
                "classes": [{"filename": "app/domain/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
            {
                "name": "application.services",
                "classes": [{"filename": "app/application/services/a.py", "hits": [1] * 18 + [0, 0]}],
            },
        ],
    )
    write_rules(rules_path)

    result = run_guard(coverage_path, rules_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["errors"]
    assert any("application.services" in item for item in payload["errors"])


def test_fails_when_core_module_below_required_threshold(tmp_path: Path):
    coverage_path = tmp_path / "coverage.xml"
    rules_path = tmp_path / "rules.json"
    write_coverage_xml(
        coverage_path,
        [
            {
                "name": "application.semantic",
                "classes": [{"filename": "app/application/semantic/a.py", "hits": [1] * 19 + [0]}],
            },
            {
                "name": "domain.semantic",
                "classes": [{"filename": "app/domain/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
        ],
    )
    write_rules(rules_path)

    result = run_guard(coverage_path, rules_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any("application.semantic" in item and "100.00%" in item for item in payload["errors"])


def test_passes_when_all_constraints_are_satisfied(tmp_path: Path):
    coverage_path = tmp_path / "coverage.xml"
    rules_path = tmp_path / "rules.json"
    write_coverage_xml(
        coverage_path,
        [
            {
                "name": "application.semantic",
                "classes": [{"filename": "app/application/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
            {
                "name": "domain.semantic",
                "classes": [{"filename": "app/domain/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
            {
                "name": "application.services",
                "classes": [{"filename": "app/application/services/a.py", "hits": [1] * 19 + [0]}],
            },
            {
                "name": "infrastructure.adapters",
                "classes": [{"filename": "app/infrastructure/adapters/a.py", "hits": [1] * 19 + [0]}],
            },
        ],
    )
    write_rules(rules_path)

    result = run_guard(coverage_path, rules_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["total_rate"] == 95.83
    assert not payload["errors"]
    assert payload["second_level_failures"] == []


def test_ignores_root_package_placeholder(tmp_path: Path):
    coverage_path = tmp_path / "coverage.xml"
    rules_path = tmp_path / "rules.json"
    write_coverage_xml(
        coverage_path,
        [
            {
                "name": ".",
                "classes": [{"filename": "app/__init__.py", "hits": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]}],
            },
            {
                "name": "application.semantic",
                "classes": [{"filename": "app/application/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
            {
                "name": "domain.semantic",
                "classes": [{"filename": "app/domain/semantic/a.py", "hits": [1, 1, 1, 1]}],
            },
        ],
    )
    write_rules(rules_path)

    result = run_guard(coverage_path, rules_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["total_rate"] == 50.0
    assert "." not in payload["module_rates"]
