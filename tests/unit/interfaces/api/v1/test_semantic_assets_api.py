from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import MagicMock

import jwt
from flask import Flask, g

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic_assets import create_semantic_assets_blueprint


def _auth_headers(roles: list[str] | None = None) -> dict[str, str]:
    token = jwt.encode(
        {
            "user_id": "test_admin",
            "user_name": "Test Admin",
            "roles": roles or ["admin"],
            "exp": datetime.utcnow() + timedelta(hours=1),
        },
        "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _build_client(service):
    app = Flask(__name__)
    app.config.update(TESTING=True, JWT_SECRET="test-secret")

    @app.before_request
    def _inject_request_context():
        g.request_id = "req-data-assets"

    app.register_blueprint(create_semantic_assets_blueprint(service))
    register_error_handlers(app)
    return app.test_client()


def test_semantic_assets_api_covers_read_and_sync_paths():
    service = MagicMock()
    service.radar_summary.return_value = {"table_count": 1, "field_count": 2}
    service.list_tables.return_value = {
        "items": [{"id": "tbl_comment", "name": "dwd_comment_df"}],
        "total": 1,
        "page": 1,
        "page_size": 20,
        "page_count": 1,
    }
    service.get_table.return_value = {"id": "tbl_comment", "name": "dwd_comment_df"}
    service.list_fields.return_value = {
        "items": [{"id": "fld_school", "name": "school_id"}],
        "total": 1,
    }
    service.build_table_evidence.return_value = {
        "subject": "data_asset_table:tbl_comment",
        "runtime_truth": False,
    }
    service.list_sync_runs.return_value = {
        "items": [{"id": "sync_1", "status": "success"}],
        "total": 1,
    }
    service.get_sync_run.return_value = {
        "id": "sync_1",
        "status": "success",
        "stats": {
            "failed_source_count": 1,
            "source_errors": [{"source_id": "mc_prod", "message": "timeout"}],
        },
    }
    service.sync_from_payload.return_value = {
        "id": "sync_2",
        "status": "success",
        "stats": {"table_count": 1},
    }
    client = _build_client(lambda: service)

    assert client.get("/api/v1/semantic/assets/radar", headers=_auth_headers()).status_code == 200
    list_resp = client.get(
        "/api/v1/semantic/assets/tables",
        query_string={"keyword": "comment", "page": 1, "page_size": 20},
        headers=_auth_headers(),
    )
    assert list_resp.status_code == 200
    assert list_resp.get_json()["data"]["items"][0]["id"] == "tbl_comment"
    assert client.get("/api/v1/semantic/assets/physical-tables", headers=_auth_headers()).status_code == 200
    filtered_resp = client.get(
        "/api/v1/semantic/assets/tables",
        query_string={
            "keyword": "comment",
            "page": 1,
            "page_size": 20,
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "schema": "dw",
            "sync_status": "success",
            "lifecycle_status": "active",
        },
        headers=_auth_headers(),
    )
    assert filtered_resp.status_code == 200
    assert client.get("/api/v1/semantic/assets/tables/tbl_comment", headers=_auth_headers()).status_code == 200
    assert client.get("/api/v1/semantic/assets/tables/tbl_comment/fields", headers=_auth_headers()).status_code == 200
    assert client.get("/api/v1/semantic/assets/tables/tbl_comment/evidence", headers=_auth_headers()).status_code == 200
    assert client.get("/api/v1/semantic/assets/sync-runs", headers=_auth_headers()).status_code == 200
    assert client.get("/api/v1/semantic/assets/sync-runs/sync_1", headers=_auth_headers()).status_code == 200

    sync_resp = client.post(
        "/api/v1/semantic/assets/sync-runs",
        json={"source_id": "maxcompute-prod", "tables": []},
        headers=_auth_headers(),
    )
    assert sync_resp.status_code == 201
    assert sync_resp.get_json()["data"]["id"] == "sync_2"
    assert client.post(
        "/api/v1/semantic/assets/metadata-sync",
        json={"source_id": "maxcompute-prod", "tables": []},
        headers=_auth_headers(),
    ).status_code == 201
    service.list_tables.assert_any_call(
        keyword="comment",
        page=1,
        page_size=20,
        source_id=None,
        database=None,
        schema=None,
        sync_status=None,
        lifecycle_status=None,
    )
    service.list_tables.assert_any_call(
        keyword="comment",
        page=1,
        page_size=20,
        source_id="maxcompute-prod",
        database="df_cb_258187",
        schema="dw",
        sync_status="success",
        lifecycle_status="active",
    )
    service.sync_from_payload.assert_called_with(
        {"source_id": "maxcompute-prod", "tables": []}
    )


def test_semantic_assets_api_returns_not_found_for_missing_table():
    service = MagicMock()
    service.get_table.return_value = None
    service.list_fields.return_value = None
    service.build_table_evidence.return_value = None
    service.get_sync_run.return_value = None
    client = _build_client(service)

    response = client.get(
        "/api/v1/semantic/assets/tables/missing",
        headers=_auth_headers(),
    )

    assert response.status_code == 404
    assert response.get_json()["message"] == "数据资产不存在"

    assert client.get(
        "/api/v1/semantic/assets/tables/missing/fields",
        headers=_auth_headers(),
    ).status_code == 404
    assert client.get(
        "/api/v1/semantic/assets/tables/missing/evidence",
        headers=_auth_headers(),
    ).status_code == 404
    assert client.get(
        "/api/v1/semantic/assets/sync-runs/missing",
        headers=_auth_headers(),
    ).status_code == 404


def test_semantic_assets_api_normalizes_invalid_pagination_args():
    service = MagicMock()
    service.list_tables.return_value = {"items": [], "total": 0}
    service.list_sync_runs.return_value = {"items": [], "total": 0}
    client = _build_client(service)

    assert client.get(
        "/api/v1/semantic/assets/tables",
        query_string={"page": "-3", "page_size": "bad"},
        headers=_auth_headers(),
    ).status_code == 200
    assert client.get(
        "/api/v1/semantic/assets/sync-runs",
        query_string={"limit": "bad"},
        headers=_auth_headers(),
    ).status_code == 200
    service.list_tables.assert_called_with(
        keyword="",
        page=1,
        page_size=20,
        source_id=None,
        database=None,
        schema=None,
        sync_status=None,
        lifecycle_status=None,
    )
    service.list_sync_runs.assert_called_with(limit=50)
