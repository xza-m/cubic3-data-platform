from __future__ import annotations

from pathlib import Path

import pytest
from flask import Flask

from app import (
    assert_semantic_modeling_copilot_routes,
    register_semantic_modeling_copilot_blueprint,
)

LEGACY_MODELING_AGENT_PREFIX = "/api/v1/semantic/modeling-" + "agent"


class _ContainerStub:
    def __init__(self, service=None, exc: Exception | None = None):
        self._service = service or object()
        self._exc = exc

    def semantic_modeling_copilot(self):
        if self._exc is not None:
            raise self._exc
        return self._service


def test_register_semantic_modeling_copilot_blueprint_adds_required_routes():
    app = Flask(__name__)
    app.config.update(TESTING=False)

    register_semantic_modeling_copilot_blueprint(app, _ContainerStub())

    assert_semantic_modeling_copilot_routes(app)
    routes = {rule.rule for rule in app.url_map.iter_rules()}
    assert "/api/v1/semantic/modeling-copilot/sessions" in routes
    assert "/api/v1/semantic/modeling-copilot/sessions/<session_id>/release-preview" in routes
    assert "/api/v1/semantic/modeling-copilot/sessions/<session_id>/publish" in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/spec-draft" not in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/validate" not in routes


def test_create_app_registers_only_modeling_copilot_public_routes(app):
    routes = {rule.rule for rule in app.url_map.iter_rules()}

    assert "/api/v1/semantic/modeling-workbench/projects" in routes
    assert "/api/v1/semantic/modeling-workbench/projects/<project_id>/scan" in routes
    assert "/api/v1/semantic/modeling-workbench/projects/<project_id>/packages/<package_id>" in routes
    assert "/api/v1/semantic/modeling-copilot/sessions" in routes
    assert "/api/v1/semantic/modeling-copilot/sessions/<session_id>/release-preview" in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/spec-draft" not in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/validate" not in routes


def test_container_registers_release_validation_preview_service():
    from app.di.container import Container

    container = Container()
    container.config.database_url.from_value("sqlite:///:memory:")
    service = container.semantic_release_validation_preview_service()

    assert service.__class__.__name__ == "ReleaseValidationPreviewService"
    assert callable(container.semantic_release_compile_preview())
    assert "semantic_compile_preview" in Container.semantic_release_validation_preview_service.kwargs
    assert (
        Container.semantic_release_validation_preview_service.kwargs["semantic_compile_preview"]
        is Container.semantic_release_compile_preview
    )
    assert "release_preview_service" in Container.semantic_modeling_copilot.kwargs
    assert (
        Container.semantic_modeling_copilot.kwargs["release_preview_service"]
        is Container.semantic_release_validation_preview_service
    )


def test_container_registers_modeling_workbench_service():
    from app.di.container import Container

    container = Container()
    container.config.database_url.from_value("sqlite:///:memory:")

    service = container.semantic_modeling_workbench_service()

    assert service.__class__.__name__ == "ModelingBuildProjectService"
    assert "repository" in Container.semantic_modeling_workbench_service.kwargs
    assert (
        Container.semantic_modeling_workbench_service.kwargs["repository"]
        is Container.semantic_modeling_workbench_repository
    )


def test_container_wires_release_preview_gateway_sql_dry_run_when_token_configured():
    from app.di.container import Container

    container = Container()
    container.config.query_gateway.base_url.from_value("http://dw-query-gateway:8000")
    container.config.query_gateway.platform_service_token.from_value("platform-secret")
    container.config.query_gateway.timeout_seconds.from_value(3)
    container.config.query_gateway.sql_dry_run_path.from_value("/api/v1/queries/dry-run")

    dry_run = container.semantic_release_gateway_sql_dry_run()

    assert callable(dry_run)


def test_register_semantic_modeling_copilot_blueprint_fails_fast_on_provider_error():
    app = Flask(__name__)
    app.config.update(TESTING=False)

    with pytest.raises(RuntimeError, match="semantic modeling copilot blueprint registration failed"):
        register_semantic_modeling_copilot_blueprint(
            app,
            _ContainerStub(exc=ValueError("missing repository")),
        )


def test_modeling_workbench_tables_have_controlled_alembic_revision():
    versions_dir = Path(__file__).resolve().parents[2] / "migrations" / "versions"
    source = (versions_dir / "0008_semantic_modeling_workbench_tables.py").read_text(
        encoding="utf-8"
    )

    assert 'revision = "0008_semantic_workbench"' in source
    assert 'down_revision = "0007_drop_query_execution_tables"' in source
    assert '"semantic_modeling_build_projects"' in source
    assert '"semantic_modeling_asset_packages"' in source
    assert '"idx_semantic_build_projects_principal_updated"' in source
    assert '"idx_semantic_asset_packages_project_status"' in source
