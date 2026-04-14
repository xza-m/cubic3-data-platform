from __future__ import annotations

from unittest.mock import MagicMock

from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic_router import create_semantic_router_blueprint


def _build_app(blueprint):
    app = Flask(__name__)
    app.config.update(TESTING=True)
    register_error_handlers(app)
    app.register_blueprint(blueprint)
    return app


def test_semantic_router_blueprint_covers_success_and_error_paths():
    service = MagicMock()
    service.route.return_value = {"route_type": "cube", "matched": {"metric_name": "gmv"}}
    service.plan.return_value = {"route": {"route_type": "cube"}, "steps": []}

    client = _build_app(create_semantic_router_blueprint(service)).test_client()

    assert client.post("/api/v1/semantic-router/route", json={"question": "查看GMV趋势"}).status_code == 200
    assert client.post("/api/v1/semantic-router/plan", json={"question": "查看GMV趋势"}).status_code == 200
    assert client.post("/api/v1/semantic-router/route", json={}).status_code == 400

    service.plan.side_effect = ValueError("route failed")
    assert client.post("/api/v1/semantic-router/plan", json={"question": "ghost"}).status_code == 400


def test_semantic_router_blueprint_covers_execute_preview_and_execute_paths():
    service = MagicMock()
    service.execute_plan_preview.return_value = {"compiled_targets": []}
    service.execute_plan.return_value = {"execution_results": []}
    client = _build_app(create_semantic_router_blueprint(service)).test_client()

    assert client.post("/api/v1/semantic-router/execute-plan-preview", json={}).status_code == 400
    assert client.post("/api/v1/semantic-router/execute-plan-preview", json={"question": "查看GMV趋势"}).status_code == 200
    assert client.post("/api/v1/semantic-router/execute-plan", json={"question": "查看GMV趋势"}).status_code == 200

    service.execute_plan.side_effect = RuntimeError("execute failed")
    assert client.post("/api/v1/semantic-router/execute-plan", json={"question": "查看GMV趋势"}).status_code == 400
