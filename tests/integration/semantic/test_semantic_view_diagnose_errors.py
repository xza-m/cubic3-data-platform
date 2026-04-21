# tests/integration/semantic/test_semantic_view_diagnose_errors.py
"""
语义接口异常分支集成测试 — 覆盖 semantic.py 中 except 块。

测试目标行号：
  - 465-467: describe_view 中 _get_vmat_service().get_view_extra_fields 异常
  - 815-817: diagnose() 的 except Exception 分支
  - 834-836: list_diagnose_runs() 的 except Exception 分支
  - 850-852: get_diagnose_run() 的 except Exception 分支

@pytest.mark.redesign
"""
import pytest
from unittest.mock import MagicMock, patch
from flask import Flask

from app.interfaces.api.v1.semantic import create_semantic_blueprint
from app.interfaces.api.middleware.error_handler import register_error_handlers


def _make_semantic_service():
    svc = MagicMock()
    svc.list_cubes.return_value = []
    svc.list_views.return_value = []
    svc.list_view_summaries = MagicMock(return_value=[])
    svc._cube_repo = MagicMock()
    svc._cube_repo._dir = None
    svc.invalidate_cache = MagicMock()
    return svc


def _make_publish_service():
    ps = MagicMock()
    ps.get_publish_status.return_value = {"status": "idle"}
    ps.get_batch_publish_status.return_value = {}
    return ps


def _make_app(vmat_svc=None, sem_svc=None):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    bp = create_semantic_blueprint(
        semantic_service=sem_svc or _make_semantic_service(),
        dataset_repo=MagicMock(),
        dataset_handler=MagicMock(),
        publish_service=_make_publish_service(),
        view_materialize_service=vmat_svc,
    )
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    return flask_app


@pytest.mark.redesign
class TestDescribeViewMaterializeException:
    """GET /views/:name — _get_vmat_service() 抛异常时降级。"""

    def test_fallback_defaults_on_vmat_error(self):
        """vmat 服务异常时返回默认 materialize_status='idle'。"""
        sem = _make_semantic_service()
        sem.describe_view.return_value = {"name": "v1", "id": 10, "title": "V1"}
        vmat = MagicMock()
        vmat.get_view_extra_fields.side_effect = RuntimeError("DB crash")
        app = _make_app(vmat_svc=vmat, sem_svc=sem)
        from tests.conftest import install_default_admin_auth
        resp = install_default_admin_auth(app.test_client()).get("/api/v1/semantic/views/v1")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["materialize_status"] == "idle"
        assert data["materialized_at"] is None


@pytest.mark.redesign
class TestDiagnoseExceptionBranch:
    """POST /diagnose — except Exception 分支（非 ValueError）。"""

    def test_generic_exception_returns_500(self, client, auth_headers):
        """DiagnoseRunService 抛非 ValueError 异常时返回 500 错误。"""
        with patch(
            "app.application.semantic.diagnose_run_service.DiagnoseRunService.diagnose_and_record",
            side_effect=RuntimeError("DB 宕机"),
        ):
            resp = client.post(
                "/api/v1/semantic/diagnose",
                json={"input_kind": "sql", "input_text": "SELECT 1"},
                headers=auth_headers,
            )
        assert resp.status_code == 500
        body = resp.get_json()
        assert "诊断失败" in body.get("message", "")


@pytest.mark.redesign
class TestListDiagnoseRunsExceptionBranch:
    """GET /diagnose/runs — except Exception 分支。"""

    def test_generic_exception_returns_500(self, client, auth_headers):
        """列表查询异常时返回 500。"""
        with patch(
            "app.application.semantic.diagnose_run_service.DiagnoseRunService.list",
            side_effect=RuntimeError("crash"),
        ):
            resp = client.get(
                "/api/v1/semantic/diagnose/runs",
                headers=auth_headers,
            )
        assert resp.status_code == 500
        body = resp.get_json()
        assert "获取诊断历史失败" in body.get("message", "")


@pytest.mark.redesign
class TestGetDiagnoseRunExceptionBranch:
    """GET /diagnose/runs/:id — except Exception 分支。"""

    def test_generic_exception_returns_500(self, client, auth_headers):
        """详情查询异常时返回 500。"""
        with patch(
            "app.application.semantic.diagnose_run_service.DiagnoseRunService.get",
            side_effect=RuntimeError("disk full"),
        ):
            resp = client.get(
                "/api/v1/semantic/diagnose/runs/1",
                headers=auth_headers,
            )
        assert resp.status_code == 500
        body = resp.get_json()
        assert "获取诊断详情失败" in body.get("message", "")
