from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import jwt
from flask import Flask, g

from app.application.semantic.schema_sync_service import DriftItem, SyncReport
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic import create_semantic_blueprint


def _auth_headers() -> dict[str, str]:
    token = jwt.encode(
        {
            "user_id": "test_admin",
            "user_name": "Test Admin",
            "roles": ["admin"],
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def test_governance_issues_route_returns_schema_sync_issues(monkeypatch):
    report = SyncReport(
        total_cubes=1,
        checked_cubes=1,
        drifts=[
            DriftItem(
                cube="orders",
                table="dw.orders",
                kind="missing_in_physical",
                column="status",
                detail="Dimension status references missing column",
                severity="error",
            )
        ],
    )
    captured: dict[str, object] = {}

    class FakeSchemaSyncService:
        def __init__(self, **kwargs):
            captured["constructor"] = kwargs

        def check_cube(self, cube_name: str) -> SyncReport:
            captured["cube_name"] = cube_name
            return report

        def check_all(self) -> SyncReport:
            captured["check_all"] = True
            return report

    monkeypatch.setattr(
        "app.application.semantic.schema_sync_service.SchemaSyncService",
        FakeSchemaSyncService,
    )

    semantic_service = MagicMock()
    semantic_service._cube_repo = MagicMock(name="cube_repo")
    semantic_service._view_repo = MagicMock(name="view_repo")
    semantic_service._definition_service = SimpleNamespace(_runtime_binding_service=None)

    app = Flask(__name__)
    app.config.update(TESTING=True, JWT_SECRET="test-secret")

    @app.before_request
    def _inject_request_context():
        g.request_id = "req-test"

    mapper_service = MagicMock()
    mapper_service.stale_check.return_value = {
        "items": [
            {
                "entity_type": "metric",
                "entity_name": "gmv",
                "status": "stale",
                "reason": "Measure 引用已失效",
                "missing_refs": ["orders.gmv"],
            }
        ]
    }
    app.container = SimpleNamespace(
        semantic_mapper_preview_service=lambda: mapper_service,
    )

    app.register_blueprint(
        create_semantic_blueprint(
            semantic_service=semantic_service,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=MagicMock(),
            registry_repo=MagicMock(),
            modeling_service=MagicMock(),
            modeling_source_service=MagicMock(),
            domain_modeling_service=MagicMock(DEFAULT_CATALOG_CODE="default"),
            domain_canvas_service=MagicMock(),
            query_adapter_getter=lambda: (None, None),
        )
    )
    register_error_handlers(app)

    response = app.test_client().get(
        "/api/v1/semantic/governance/issues",
        query_string={"cube_name": "orders"},
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["summary"]["issue_count"] == 2
    assert payload["summary"]["status"] == "error"
    assert payload["summary"]["by_code"] == {
        "physical_schema_missing_column": 1,
        "ontology_measure_ref_stale": 1,
    }
    schema_item = next(
        item for item in payload["items"] if item["source"] == "schema_sync"
    )
    assert schema_item["code"] == "physical_schema_missing_column"
    assert schema_item["metadata"]["kind"] == "missing_in_physical"
    assert any(item["source"] == "semantic_mapper" for item in payload["items"])
    assert captured["cube_name"] == "orders"
    assert captured["constructor"]["cube_repo"] is semantic_service._cube_repo
    mapper_service.stale_check.assert_called_once_with()
