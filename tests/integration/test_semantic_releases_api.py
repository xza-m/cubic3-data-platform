from __future__ import annotations

from types import SimpleNamespace

from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic_releases import create_semantic_releases_blueprint
from tests.conftest import install_default_admin_auth


class _ReleaseServiceStub:
    def __init__(self):
        self.calls = []

    def rollback_to(self, *, namespace, release_id, actor, idempotency_key):
        self.calls.append(
            {
                "namespace": namespace,
                "release_id": release_id,
                "actor": actor,
                "idempotency_key": idempotency_key,
            }
        )
        if release_id == "missing":
            raise ValueError("semantic release not found: missing")
        if release_id == "empty":
            raise ValueError("semantic release has no assets: empty")
        return SimpleNamespace(
            id="rel_rollback",
            release_no=3,
            namespace=namespace,
            status="published",
            scope_json={"rollback_to_release_id": release_id},
            gate_result_json={"decision": "allow", "rollback": True},
            previous_release_id="rel_2",
            rollback_of_release_id=release_id,
            idempotency_key=idempotency_key,
            published_by=actor,
            published_at="2026-05-19T00:00:00Z",
            created_at="2026-05-19T00:00:00Z",
        )


def _client():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    service = _ReleaseServiceStub()
    app.register_blueprint(create_semantic_releases_blueprint(service))
    register_error_handlers(app)
    return install_default_admin_auth(app.test_client(), roles=("admin",)), service


def test_semantic_release_rollback_api_creates_rollback_release():
    client, service = _client()

    response = client.post(
        "/api/v1/semantic/releases/rel_1/rollback",
        json={"namespace": "qa_live_1", "idempotency_key": "rollback_1"},
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["id"] == "rel_rollback"
    assert payload["release_no"] == 3
    assert payload["rollback_of_release_id"] == "rel_1"
    assert service.calls == [
        {
            "namespace": "qa_live_1",
            "release_id": "rel_1",
            "actor": "test_admin",
            "idempotency_key": "rollback_1",
        }
    ]


def test_semantic_release_rollback_api_requires_idempotency_key():
    client, _service = _client()

    response = client.post(
        "/api/v1/semantic/releases/rel_1/rollback",
        json={"namespace": "qa_live_1"},
    )

    assert response.status_code == 400
    assert "idempotency_key" in response.get_json()["message"]


def test_semantic_release_rollback_api_maps_missing_release_to_404():
    client, _service = _client()

    response = client.post(
        "/api/v1/semantic/releases/missing/rollback",
        json={"namespace": "qa_live_1", "idempotency_key": "rollback_1"},
    )

    assert response.status_code == 404
    assert response.get_json()["message"] == "semantic release not found: missing"


def test_semantic_release_rollback_api_maps_invalid_rollback_to_400():
    client, _service = _client()

    response = client.post(
        "/api/v1/semantic/releases/empty/rollback",
        json={"namespace": "qa_live_1", "idempotency_key": "rollback_1"},
    )

    assert response.status_code == 400
    assert response.get_json()["message"] == "semantic release has no assets: empty"
