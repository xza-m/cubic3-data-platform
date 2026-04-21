# tests/integration/semantic_mapper/test_semantic_mapper_api.py
"""
W5.B · Semantic Mapper Preview API 集成测试

通过工厂 ``create_semantic_mapper_blueprint(mapper_service)`` 注入 Mock 服务。

覆盖路径：
  POST /api/v1/semantic-mapper/preview                 → 预览
  GET  /api/v1/semantic-mapper/stale-check             → 陈旧检查
  GET  /api/v1/semantic-mapper/measure-backlinks       → Measure 反链

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic_mapper import create_semantic_mapper_blueprint

BASE = "/api/v1/semantic-mapper"


def _build_client(service: MagicMock):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    bp = create_semantic_mapper_blueprint(service)
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    from tests.conftest import install_default_admin_auth
    return flask_app, install_default_admin_auth(flask_app.test_client())


@pytest.mark.redesign
class TestMapperPreview:
    def test_preview_happy(self):
        svc = MagicMock()
        svc.preview.return_value = {"entity": "order", "fields": ["id", "name"]}
        _, client = _build_client(svc)

        resp = client.post(
            f"{BASE}/preview",
            json={"entity_type": "object", "entity_name": "order"},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["entity"] == "order"
        svc.preview.assert_called_once_with(entity_type="object", entity_name="order")

    def test_preview_missing_fields_returns_error(self):
        svc = MagicMock()
        _, client = _build_client(svc)

        resp = client.post(f"{BASE}/preview", json={})
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0
        assert "entity_type" in body["message"]
        svc.preview.assert_not_called()


@pytest.mark.redesign
class TestStaleCheck:
    def test_stale_check_returns_payload(self):
        svc = MagicMock()
        svc.stale_check.return_value = {"stale": [], "fresh": ["order"]}
        _, client = _build_client(svc)

        resp = client.get(f"{BASE}/stale-check")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["fresh"] == ["order"]


@pytest.mark.redesign
class TestMeasureBacklinks:
    def test_backlinks_happy(self):
        svc = MagicMock()
        svc.measure_backlinks.return_value = {"refs": ["metric.gmv"]}
        _, client = _build_client(svc)

        resp = client.get(f"{BASE}/measure-backlinks?measure_ref=orders.gmv")
        assert resp.status_code == 200
        assert "refs" in resp.get_json()["data"]
        svc.measure_backlinks.assert_called_once_with("orders.gmv")

    def test_backlinks_missing_param_returns_error(self):
        svc = MagicMock()
        _, client = _build_client(svc)

        resp = client.get(f"{BASE}/measure-backlinks")
        assert resp.status_code == 400
        assert resp.get_json()["code"] != 0


@pytest.mark.redesign
class TestSemanticMapperAuth:
    def test_stale_check_requires_auth(self):
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_semantic_mapper_blueprint(MagicMock())
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        resp = flask_app.test_client().get(f"{BASE}/stale-check")
        assert resp.status_code == 401
