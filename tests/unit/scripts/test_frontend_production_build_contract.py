from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_nginx_docker_build_uses_v2_production_build():
    dockerfile = (REPO_ROOT / "docker" / "nginx.Dockerfile").read_text(encoding="utf-8")

    assert "RUN npm run build:v2" in dockerfile
    assert "RUN npm run build\n" not in dockerfile
    assert "COPY --from=frontend-builder /build/frontend/dist-v2 /usr/share/nginx/html" in dockerfile


def test_frontend_dockerignore_excludes_local_tests_from_production_context():
    dockerignore = (REPO_ROOT / "frontend" / ".dockerignore").read_text(encoding="utf-8")

    for pattern in (
        "src/**/*.test.*",
        "src/**/*.spec.*",
        "tests",
        "playwright-report*",
    ):
        assert pattern in dockerignore
