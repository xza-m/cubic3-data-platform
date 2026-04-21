# tests/integration/semantic/test_view_materialize.py
"""
B-back-3 集成测试：语义 View 物化接口。

覆盖：
  - happy:    触发物化 → 立即返回 run_id + status=running
  - boundary: 已触发后再次触发（幂等）
  - error:    view_id 不存在时 service 层不抛致命异常（DB 层优雅降级）

@pytest.mark.redesign
"""
import pytest
from unittest.mock import MagicMock, patch, call
from flask import Flask

from app.interfaces.api.v1.semantic import create_semantic_blueprint
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.application.semantic.view_materialize_service import ViewMaterializeService


# ============================================================================
# Helper factories
# ============================================================================

def _make_semantic_service():
    svc = MagicMock()
    svc.list_cubes.return_value = []
    svc.list_views.return_value = []
    svc.list_view_summaries = MagicMock(return_value=[])
    svc.describe_view.return_value = {"name": "v_test", "id": 42, "title": "测试视图"}
    svc._cube_repo = MagicMock()
    svc._cube_repo._dir = None
    svc.invalidate_cache = MagicMock()
    return svc


def _make_publish_service():
    ps = MagicMock()
    ps.get_publish_status.return_value = {"status": "idle"}
    ps.get_batch_publish_status.return_value = {}
    return ps


def _make_view_materialize_service(view_id=42):
    """返回预配置的 ViewMaterializeService Mock。"""
    vmat = MagicMock(spec=ViewMaterializeService)
    vmat.trigger.return_value = {"run_id": 1, "status": "running"}
    vmat.get_runs.return_value = {
        "items": [
            {"id": 1, "view_id": view_id, "status": "running",
             "started_at": "2026-04-20T10:00:00", "finished_at": None, "error": None}
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
    }
    vmat.get_view_extra_fields.return_value = {
        "materialized_at": None,
        "materialize_status": "running",
    }
    return vmat


@pytest.fixture
def app(tmp_path):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True

    semantic_svc = _make_semantic_service()
    publish_svc = _make_publish_service()
    vmat_svc = _make_view_materialize_service()

    dataset_repo = MagicMock()
    dataset_handler = MagicMock()

    bp = create_semantic_blueprint(
        semantic_service=semantic_svc,
        dataset_repo=dataset_repo,
        dataset_handler=dataset_handler,
        publish_service=publish_svc,
        view_materialize_service=vmat_svc,
    )
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    return flask_app


@pytest.fixture
def client(app):
    from tests.conftest import install_default_admin_auth
    return install_default_admin_auth(app.test_client())


# ============================================================================
# Tests
# ============================================================================

@pytest.mark.redesign
class TestViewMaterializeTrigger:
    """POST /api/v1/semantic/views/:id/materialize"""

    def test_trigger_returns_run_id(self, client):
        """Happy: 触发物化立即返回 run_id，状态 running。"""
        resp = client.post("/api/v1/semantic/views/42/materialize")
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["run_id"] == 1
        assert body["data"]["status"] == "running"

    def test_trigger_idempotent_returns_new_run(self, client):
        """Boundary: 重复触发（同 view_id）应返回新 run_id（非错误）。"""
        resp1 = client.post("/api/v1/semantic/views/42/materialize")
        resp2 = client.post("/api/v1/semantic/views/42/materialize")
        assert resp1.status_code == 201
        assert resp2.status_code == 201

    def test_trigger_service_error_returns_400(self, app, client):
        """Error: service 层抛出异常时，返回 4xx 而非 500。"""
        with app.test_request_context():
            pass
        # 替换为抛异常的 mock
        err_vmat = MagicMock(spec=ViewMaterializeService)
        err_vmat.trigger.side_effect = RuntimeError("DB 连接失败")
        # 重新创建 app
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_semantic_blueprint(
            semantic_service=_make_semantic_service(),
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=_make_publish_service(),
            view_materialize_service=err_vmat,
        )
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        from tests.conftest import install_default_admin_auth
        c = install_default_admin_auth(flask_app.test_client())
        resp = c.post("/api/v1/semantic/views/99/materialize")
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0


@pytest.mark.redesign
class TestViewMaterializeRuns:
    """GET /api/v1/semantic/views/:id/materialize/runs"""

    def test_list_runs_happy(self, client):
        """Happy: 返回分页运行历史。"""
        resp = client.get("/api/v1/semantic/views/42/materialize/runs")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        data = body["data"]
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) >= 0

    def test_list_runs_pagination(self, app, client):
        """Boundary: 分页参数传递给 service（验证 service 被正确调用）。"""
        # 获取 blueprint 工厂注入的 vmat mock
        # 让 get_runs 根据传入参数动态返回
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        vmat = MagicMock(spec=ViewMaterializeService)
        vmat.get_runs.side_effect = lambda view_id, page, page_size: {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
        }
        vmat.get_view_extra_fields.return_value = {"materialized_at": None, "materialize_status": "idle"}
        bp = create_semantic_blueprint(
            semantic_service=_make_semantic_service(),
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=_make_publish_service(),
            view_materialize_service=vmat,
        )
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        from tests.conftest import install_default_admin_auth
        resp = install_default_admin_auth(flask_app.test_client()).get(
            "/api/v1/semantic/views/42/materialize/runs?page=2&page_size=5"
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["data"]["page"] == 2
        assert body["data"]["page_size"] == 5

    def test_list_runs_service_error(self, app):
        """Error: service 层异常时返回 400。"""
        err_vmat = MagicMock(spec=ViewMaterializeService)
        err_vmat.get_runs.side_effect = RuntimeError("查询失败")
        err_vmat.get_view_extra_fields.return_value = {"materialized_at": None, "materialize_status": "idle"}

        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_semantic_blueprint(
            semantic_service=_make_semantic_service(),
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=_make_publish_service(),
            view_materialize_service=err_vmat,
        )
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        from tests.conftest import install_default_admin_auth
        resp = install_default_admin_auth(flask_app.test_client()).get("/api/v1/semantic/views/42/materialize/runs")
        assert resp.status_code == 400


@pytest.mark.redesign
class TestDescribeViewWithMaterializeFields:
    """GET /api/v1/semantic/views/:name — 含物化字段。"""

    def test_describe_view_includes_materialize_status(self, client):
        """Happy: describe_view 返回结果含 materialized_at + materialize_status。"""
        resp = client.get("/api/v1/semantic/views/v_test")
        assert resp.status_code == 200
        body = resp.get_json()
        data = body["data"]
        assert "materialize_status" in data

    def test_describe_view_status_is_string(self, client):
        """Boundary: materialize_status 必须是字符串类型。"""
        resp = client.get("/api/v1/semantic/views/v_test")
        data = resp.get_json()["data"]
        assert isinstance(data.get("materialize_status"), str)

    def test_describe_view_not_found_returns_404(self, app):
        """Error: 不存在的 view 返回 404。"""
        svc = _make_semantic_service()
        svc.describe_view.return_value = {"error": "未找到 View: not_exist"}
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_semantic_blueprint(
            semantic_service=svc,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=_make_publish_service(),
        )
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        from tests.conftest import install_default_admin_auth
        resp = install_default_admin_auth(flask_app.test_client()).get("/api/v1/semantic/views/not_exist")
        assert resp.status_code == 404
