# tests/integration/datasets/test_datasets_api.py
"""
W5.B · Datasets API 集成测试

通过工厂 ``create_datasets_blueprint(container)`` 注入 Mock 容器，
独立 Flask app，避免依赖全局 DI 与真实数据库。

覆盖路径：
  GET    /api/v1/data-center/datasets             → 列表
  GET    /api/v1/data-center/datasets/<id>        → 详情
  POST   /api/v1/data-center/datasets             → 创建
  POST   /api/v1/data-center/datasets/preview     → 预览（参数错误）

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.datasets import create_datasets_blueprint

BASE = "/api/v1/data-center/datasets"


def _make_dataset(**fields):
    """构造一个 to_dict 行为可控的 mock 数据集。"""
    ds = MagicMock()
    ds.to_dict.return_value = {
        "id": fields.get("id", 1),
        "dataset_code": fields.get("dataset_code", "ds_demo"),
        "dataset_name": fields.get("dataset_name", "demo"),
        "physical_table": fields.get("physical_table", "db.t"),
        **fields,
    }
    return ds


def _build_client(container_factory):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    container = container_factory()
    bp = create_datasets_blueprint(container)
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    from tests.conftest import install_default_admin_auth
    return flask_app, install_default_admin_auth(flask_app.test_client())


@pytest.mark.redesign
class TestListDatasets:
    def test_list_happy(self):
        def factory():
            handler = MagicMock()
            handler.handle.return_value = {
                "items": [_make_dataset(id=1, dataset_code="ds_a")],
                "total": 1,
                "page": 1,
                "page_size": 20,
                "total_pages": 1,
            }
            container = MagicMock()
            container.list_datasets_handler.return_value = handler
            return container

        _, client = _build_client(factory)
        resp = client.get(BASE)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["total"] == 1
        assert body["data"]["items"][0]["dataset_code"] == "ds_a"


@pytest.mark.redesign
class TestGetDataset:
    def test_get_happy_with_fields(self):
        def factory():
            ds = _make_dataset(id=99, dataset_code="ds_x")
            ds.to_dict.return_value = {"id": 99, "dataset_code": "ds_x", "fields": []}
            handler = MagicMock()
            handler.handle.return_value = ds
            container = MagicMock()
            container.get_dataset_handler.return_value = handler
            return container

        _, client = _build_client(factory)
        resp = client.get(f"{BASE}/99?include_fields=true")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["id"] == 99


@pytest.mark.redesign
class TestCreateDataset:
    def test_create_invalid_payload_returns_400(self):
        """缺少必填字段 → Pydantic 校验失败 → 400。"""
        def factory():
            return MagicMock()

        _, client = _build_client(factory)
        resp = client.post(BASE, json={"dataset_name": ""})
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0


@pytest.mark.redesign
class TestPreviewDataset:
    def test_preview_invalid_payload_returns_400(self):
        def factory():
            return MagicMock()

        _, client = _build_client(factory)
        resp = client.post(f"{BASE}/preview", json={})
        assert resp.status_code == 400


@pytest.mark.redesign
class TestDatasetsAuth:
    def test_list_requires_auth(self):
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_datasets_blueprint(MagicMock())
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        resp = flask_app.test_client().get(BASE)
        assert resp.status_code == 401
