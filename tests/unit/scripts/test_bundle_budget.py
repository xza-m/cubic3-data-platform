import gzip
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "scripts" / "checks" / "bundle_budget.py"


def make_dist(tmp_path: Path, files: dict[str, bytes]) -> Path:
    """build a fake dist-v2 layout with the given <name>-<hash>.js files."""
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    for name, data in files.items():
        (assets / name).write_bytes(data)
    return dist


def run(dist: Path) -> tuple[int, dict]:
    proc = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--dist", str(dist), "--json"],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT)},
    )
    payload = json.loads(proc.stdout) if proc.stdout.strip() else {}
    return proc.returncode, payload


def test_budget_passes_when_under_limit(tmp_path):
    body = b"x" * 100  # gzip well below any budget
    dist = make_dist(
        tmp_path,
        {
            "index-abc.js": body,
            "react-vendor-def.js": body,
            "query-vendor-ghi.js": body,
            "semantic-jkl.js": body,
        },
    )
    rc, payload = run(dist)
    assert rc == 0
    assert payload["failures"] == 0
    assert payload["over_total"] is False
    assert any(c["prefix"] == "index" and c["status"] == "pass" for c in payload["chunks"])


def test_budget_fails_when_chunk_oversized(tmp_path):
    # 200 KB of incompressible random bytes → gzip near 200 KB → exceeds index budget (80 KB).
    rng = os.urandom(200_000)
    body = rng
    dist = make_dist(
        tmp_path,
        {
            "index-abc.js": body,
        },
    )
    rc, payload = run(dist)
    assert rc != 0
    assert payload["failures"] >= 1
    bad = next(c for c in payload["chunks"] if c["prefix"] == "index")
    assert bad["status"] == "fail"
    # gzip size should still be in the same order as raw size (incompressible)
    assert bad["gzip"] > bad["budget"]


def test_unknown_chunk_skipped(tmp_path):
    body = b"some-bytes"
    dist = make_dist(
        tmp_path,
        {
            "totally-unknown-aaa.js": body,
        },
    )
    rc, payload = run(dist)
    assert rc == 0
    assert all(c["status"] in {"pass", "skip", "fail"} for c in payload["chunks"])
    assert any(c["status"] == "skip" for c in payload["chunks"])


def test_missing_dist_returns_error(tmp_path):
    rc, _payload = run(tmp_path / "does-not-exist")
    assert rc != 0


def test_gzip_size_uses_gzip(tmp_path):
    # sanity: zero-byte file gzips to a small but >0 footprint
    f = tmp_path / "empty.bin"
    f.write_bytes(b"")
    assert len(gzip.compress(f.read_bytes())) > 0
