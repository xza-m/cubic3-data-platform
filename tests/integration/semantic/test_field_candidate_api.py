"""字段候选 API 兼容 facade 集成测试。"""
from unittest.mock import MagicMock

import pytest
from flask import Flask

from app.application.semantic.cube_modeling_service import CubeModelingService
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic import create_semantic_blueprint


class _CandidateSetStub:
    def __init__(self, payload):
        self._payload = payload

    def to_dict(self):
        return self._payload


@pytest.fixture
def field_candidate_client():
    app = Flask(__name__)
    app.config["TESTING"] = True

    semantic_service = MagicMock()
    semantic_service._view_repo.list_all.return_value = []
    semantic_service._cube_repo.list_all.return_value = []
    semantic_service._recipe_repo.list_all.return_value = []

    field_candidate_service = MagicMock()
    field_candidate_service.preview_from_columns.return_value = _CandidateSetStub(
        {
            "candidate_set_id": "fcand_test",
            "summary": {"dimensions": 1, "measures": 1},
            "fields": [
                {"field": "student_id", "selected_role": "dimension.identifier"},
                {"field": "answer_cnt", "selected_role": "measure.sum"},
            ],
        }
    )

    modeling_service = MagicMock()
    modeling_service.build_cube_draft_from_inline_candidate_payload.return_value = {
        "name": "student_answer_stats",
        "status": "draft",
        "field_candidate_trace": {"draft_source_mode": "inline_candidate"},
    }

    bp = create_semantic_blueprint(
        semantic_service=semantic_service,
        dataset_repo=MagicMock(),
        dataset_handler=MagicMock(),
        publish_service=MagicMock(),
        modeling_service=modeling_service,
        modeling_source_service=MagicMock(),
        domain_modeling_service=MagicMock(),
        domain_canvas_service=MagicMock(),
        runtime_snapshot_service=MagicMock(),
        field_candidate_service=field_candidate_service,
    )
    app.register_blueprint(bp)
    register_error_handlers(app)

    from tests.conftest import install_default_admin_auth

    return (
        install_default_admin_auth(app.test_client()),
        field_candidate_service,
        modeling_service,
    )


def test_preview_field_candidates_returns_candidate_set(field_candidate_client):
    client, field_candidate_service, _ = field_candidate_client

    resp = client.post(
        "/api/v1/semantic/field-candidates/preview",
        json={
            "source": {"source_kind": "physical_table", "table": "student_answer"},
            "columns": [
                {"name": "student_id", "type": "bigint", "comment": "学生 ID"},
                {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
            ],
            "selected_overrides": {"answer_cnt": "measure.sum"},
        },
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["candidate_set_id"] == "fcand_test"
    assert data["summary"]["measures"] == 1
    field_candidate_service.preview_from_columns.assert_called_once_with(
        source={"source_kind": "physical_table", "table": "student_answer"},
        columns=[
            {"name": "student_id", "type": "bigint", "comment": "学生 ID"},
            {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
        ],
        selected_overrides={"answer_cnt": "measure.sum"},
    )


def test_preview_field_candidates_rejects_non_list_columns(field_candidate_client):
    client, field_candidate_service, _ = field_candidate_client

    resp = client.post(
        "/api/v1/semantic/field-candidates/preview",
        json={"source": {"source_kind": "physical_table"}, "columns": {"name": "bad"}},
    )

    assert resp.status_code == 400
    assert "columns" in resp.get_json()["message"]
    field_candidate_service.preview_from_columns.assert_not_called()


def test_draft_from_candidates_returns_cube_draft(field_candidate_client):
    client, _, modeling_service = field_candidate_client
    payload = {
        "candidate_set": {
            "candidate_set_id": "fcand_inline",
            "source": {"source_kind": "inline_candidate", "table": "student_answer"},
            "fields": [{"field": "student_id", "physical_type": {"raw_type": "bigint"}}],
        },
        "source_id": 1,
        "database": "mock_project",
        "table": "student_answer",
        "name": "student_answer_stats",
    }

    resp = client.post("/api/v1/semantic/cubes/draft-from-candidates", json=payload)

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["status"] == "draft"
    assert data["field_candidate_trace"]["draft_source_mode"] == "inline_candidate"
    modeling_service.build_cube_draft_from_inline_candidate_payload.assert_called_once_with(payload)


def test_draft_from_candidates_returns_compatibility_error_when_service_missing(field_candidate_client):
    client, _, modeling_service = field_candidate_client
    del modeling_service.build_cube_draft_from_inline_candidate_payload

    resp = client.post(
        "/api/v1/semantic/cubes/draft-from-candidates",
        json={"candidate_set": {"fields": []}},
    )

    assert resp.status_code == 400
    assert resp.get_json()["message"] == "当前 modeling_service 不支持 draft-from-candidates"


def test_draft_from_candidates_keeps_internal_attribute_error_message(field_candidate_client):
    client, _, modeling_service = field_candidate_client
    modeling_service.build_cube_draft_from_inline_candidate_payload.side_effect = AttributeError(
        "candidate missing physical_type"
    )

    resp = client.post(
        "/api/v1/semantic/cubes/draft-from-candidates",
        json={"candidate_set": {"fields": []}},
    )

    assert resp.status_code == 400
    message = resp.get_json()["message"]
    assert "不支持 draft-from-candidates" not in message
    assert "candidate missing physical_type" in message


def test_real_modeling_service_inline_candidate_trace_keeps_incoming_candidate_set_id():
    service = CubeModelingService(
        cube_repo=MagicMock(),
        runtime_binding_service=MagicMock(),
    )

    draft = service.build_cube_draft_from_inline_candidate_payload(
        {
            "candidate_set": {
                "candidate_set_id": "fcand_inline_input",
                "source": {
                    "source_kind": "inline_candidate",
                    "database": "mock_project",
                    "table": "student_answer",
                },
                "fields": [
                    {
                        "field": "student_id",
                        "physical_type": {"raw_type": "bigint"},
                        "comment": "学生 ID",
                        "selected_role": "dimension.identifier",
                    },
                    {
                        "field": "answer_cnt",
                        "physical_type": {"raw_type": "bigint"},
                        "comment": "答题次数",
                        "selected_role": "measure.sum",
                    },
                ],
            },
            "source_id": 1,
            "database": "mock_project",
            "table": "student_answer",
            "name": "student_answer_stats",
        }
    )

    trace = draft["field_candidate_trace"]
    assert trace["draft_source_mode"] == "inline_candidate"
    assert trace["source"]["incoming_candidate_set_id"] == "fcand_inline_input"
    assert trace["candidate_set_id"].startswith("fcand_")
    assert trace["candidate_set_id"] != "fcand_inline_input"
