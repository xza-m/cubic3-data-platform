from __future__ import annotations

from flask import Flask

from app.interfaces.api.v1.semantic_modeling_workbench import (
    create_semantic_modeling_workbench_blueprint,
)


class _ServiceStub:
    def __init__(self):
        self.calls = []

    def create_project(self, payload, *, principal_id=None):
        self.calls.append(("create_project", payload, principal_id))
        return {"id": "build-learning", "name": payload["name"], "target": "semantic_center"}

    def list_projects(self, *, principal_id=None, limit=50):
        self.calls.append(("list_projects", limit, principal_id))
        return {"items": [{"id": "build-learning", "name": "学情分析"}], "total": 1}

    def get_project(self, project_id, *, principal_id=None):
        self.calls.append(("get_project", project_id, principal_id))
        return {"id": project_id, "asset_packages": []}

    def scan_project(self, project_id, payload, *, principal_id=None):
        self.calls.append(("scan_project", project_id, payload, principal_id))
        return {"id": project_id, "status": "scanned", "asset_package_count": 3}

    def get_asset_package(self, project_id, package_id, *, principal_id=None):
        self.calls.append(("get_asset_package", project_id, package_id, principal_id))
        return {
            "id": package_id,
            "project_id": project_id,
            "status": "ready_for_review",
            "target": "semantic_center",
        }

    def update_asset_package(self, project_id, package_id, payload, *, principal_id=None):
        self.calls.append(("update_asset_package", project_id, package_id, payload, principal_id))
        return {
            "id": package_id,
            "project_id": project_id,
            "status": payload["status"],
            "target": "semantic_center",
        }


def _client(service):
    app = Flask(__name__)
    app.config.update(TESTING=True)
    app.register_blueprint(create_semantic_modeling_workbench_blueprint(service))
    return app.test_client()


def test_modeling_workbench_project_routes():
    service = _ServiceStub()
    client = _client(service)

    create_resp = client.post("/api/v1/semantic/modeling-workbench/projects", json={"name": "学情分析"})
    assert create_resp.status_code == 200
    assert create_resp.get_json()["data"]["target"] == "semantic_center"

    list_resp = client.get("/api/v1/semantic/modeling-workbench/projects")
    assert list_resp.status_code == 200
    assert list_resp.get_json()["data"]["total"] == 1

    get_resp = client.get("/api/v1/semantic/modeling-workbench/projects/build-learning")
    assert get_resp.status_code == 200
    assert get_resp.get_json()["data"]["id"] == "build-learning"

    scan_resp = client.post(
        "/api/v1/semantic/modeling-workbench/projects/build-learning/scan",
        json={"strategy": "balanced"},
    )
    assert scan_resp.status_code == 200
    assert scan_resp.get_json()["data"]["asset_package_count"] == 3


def test_modeling_workbench_asset_package_routes():
    service = _ServiceStub()
    client = _client(service)
    package_path = (
        "/api/v1/semantic/modeling-workbench/projects/build-learning"
        "/packages/build-learning:fact:dwd-learning-activity-df"
    )

    get_resp = client.get(package_path)
    assert get_resp.status_code == 200
    assert get_resp.get_json()["data"]["target"] == "semantic_center"

    update_resp = client.patch(package_path, json={"status": "in_review"})
    assert update_resp.status_code == 200
    assert update_resp.get_json()["data"]["status"] == "in_review"

    assert service.calls[-1] == (
        "update_asset_package",
        "build-learning",
        "build-learning:fact:dwd-learning-activity-df",
        {"status": "in_review"},
        None,
    )


def test_modeling_workbench_rejects_invalid_project_payload_before_service_call():
    service = _ServiceStub()
    client = _client(service)

    for payload in (
        {"name": " ", "business_domain": "学情分析"},
        {"name": "学情分析", "business_domain": "\t"},
    ):
        resp = client.post("/api/v1/semantic/modeling-workbench/projects", json=payload)

        assert resp.status_code == 422
        assert resp.get_json()["details"]["code"] == "MODELING_WORKBENCH_VALIDATION_ERROR"

    assert service.calls == []


def test_modeling_workbench_rejects_invalid_project_list_limit():
    service = _ServiceStub()
    client = _client(service)

    for limit in ("0", "101", "bad"):
        resp = client.get(f"/api/v1/semantic/modeling-workbench/projects?limit={limit}")

        assert resp.status_code == 422
        assert resp.get_json()["details"]["code"] == "MODELING_WORKBENCH_VALIDATION_ERROR"

    assert service.calls == []


def test_modeling_workbench_asset_package_action_route():
    class _ActionService(_ServiceStub):
        def apply_asset_package_action(self, project_id, package_id, payload, *, principal_id=None):
            self.calls.append(("apply_asset_package_action", project_id, package_id, payload, principal_id))
            return {
                "id": package_id,
                "project_id": project_id,
                "status": "deferred",
                "target": "semantic_center",
                "operation_history": [{"action": payload["action"], "reason": payload.get("reason")}],
            }

    service = _ActionService()
    client = _client(service)

    resp = client.post(
        "/api/v1/semantic/modeling-workbench/projects/build-learning/packages/build-learning:fact:dwd-learning/actions",
        json={"action": "defer", "reason": "等待业务 owner 确认"},
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["status"] == "deferred"
    assert service.calls[-1] == (
        "apply_asset_package_action",
        "build-learning",
        "build-learning:fact:dwd-learning",
        {"action": "defer", "reason": "等待业务 owner 确认"},
        None,
    )
