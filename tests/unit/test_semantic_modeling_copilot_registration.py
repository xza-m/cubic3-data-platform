from __future__ import annotations

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
    assert "/api/v1/semantic/modeling-copilot/sessions/<session_id>/publish" in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/spec-draft" not in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/validate" not in routes


def test_create_app_registers_only_modeling_copilot_public_routes(app):
    routes = {rule.rule for rule in app.url_map.iter_rules()}

    assert "/api/v1/semantic/modeling-copilot/sessions" in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/spec-draft" not in routes
    assert f"{LEGACY_MODELING_AGENT_PREFIX}/validate" not in routes


def test_register_semantic_modeling_copilot_blueprint_fails_fast_on_provider_error():
    app = Flask(__name__)
    app.config.update(TESTING=False)

    with pytest.raises(RuntimeError, match="semantic modeling copilot blueprint registration failed"):
        register_semantic_modeling_copilot_blueprint(
            app,
            _ContainerStub(exc=ValueError("missing repository")),
        )
