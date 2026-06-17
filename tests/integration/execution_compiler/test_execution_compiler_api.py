# tests/integration/execution_compiler/test_execution_compiler_api.py
"""
W5.B · Execution Compiler API 集成测试

通过工厂 ``create_execution_compiler_blueprint(preview_service, runtime_service)``
注入 Mock 服务。

覆盖路径：
  POST /api/v1/execution-compiler/compile-preview     → 编译预览
  POST /api/v1/execution-compiler/plan-preview        → 计划预览
  POST /api/v1/execution-compiler/execute             → 执行（require_admin）

矩阵：happy / boundary / error + RBAC（viewer 403）。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import jwt
import pytest
from flask import Flask

from app.application.access.identity import AccessIdentityService
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.execution_compiler import create_execution_compiler_blueprint

BASE = "/api/v1/execution-compiler"


def _install_access_identity(flask_app: Flask) -> None:
    flask_app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(flask_app)
    with flask_app.app_context():
        from app.infrastructure.access.models import (  # noqa: F401
            AccessApiKeyORM,
            AccessDelegationEventORM,
            AccessPrincipalAliasORM,
            AccessPrincipalORM,
            AccessRoleBindingORM,
            AccessServicePrincipalORM,
        )

        db.create_all()
        repo = SqlAccessRepository(db.session)
        repo.upsert_principal(
            principal_id="test_admin",
            principal_type="human",
            idp="internal",
            tenant_key="local",
            display_name="Test Admin",
        )
        repo.commit()
        AccessIdentityService(repo).ensure_principal_role_bindings(
            principal_id="test_admin",
            roles=["platform_admin", "data_m1_reader"],
            source="pytest",
            created_by="test_admin",
        )


def _build_client(preview_service: MagicMock, runtime_service=None):
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    _install_access_identity(flask_app)
    bp = create_execution_compiler_blueprint(preview_service, runtime_service=runtime_service)
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    from tests.conftest import install_default_admin_auth
    return flask_app, install_default_admin_auth(flask_app.test_client())


def _viewer_token() -> str:
    payload = {
        "user_id": "viewer1",
        "principal_id": "viewer1",
        "user_name": "viewer",
        "roles": ["user"],
        "token_use": "access",
        "sid": "test-session",
        "jti": "test-access-token",
        "iat": datetime.now(tz=timezone.utc),
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, "your-secret-key", algorithm="HS256")


@pytest.mark.redesign
class TestCompilePreview:
    def test_compile_preview_happy(self):
        svc = MagicMock()
        svc.compile_preview.return_value = {"sql": "SELECT 1", "warnings": []}
        _, client = _build_client(svc)

        resp = client.post(
            f"{BASE}/compile-preview",
            json={"target_type": "sql", "metric_name": "gmv"},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["sql"] == "SELECT 1"
        kwargs = svc.compile_preview.call_args.kwargs
        assert kwargs["target_type"] == "sql"
        assert kwargs["metric_name"] == "gmv"

    def test_compile_preview_service_error_returns_400(self):
        svc = MagicMock()
        svc.compile_preview.side_effect = RuntimeError("无法编译: 缺少 metric")
        _, client = _build_client(svc)

        resp = client.post(f"{BASE}/compile-preview", json={"target_type": "sql"})
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0
        assert "无法编译" in body["message"]


@pytest.mark.redesign
class TestPlanPreview:
    def test_plan_preview_happy(self):
        svc = MagicMock()
        svc.compile_plan_preview.return_value = {"plan": [{"step": "scan"}]}
        _, client = _build_client(svc)

        resp = client.post(
            f"{BASE}/plan-preview",
            json={"target_type": "retrieval", "retrieval_query": "Q"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["data"]["plan"][0]["step"] == "scan"


@pytest.mark.redesign
class TestExecuteRBAC:
    def test_execute_admin_happy(self):
        preview = MagicMock()
        runtime = MagicMock()
        runtime.execute.return_value = {"status": "ok", "rows": []}
        _, client = _build_client(preview, runtime_service=runtime)

        resp = client.post(f"{BASE}/execute", json={"target_type": "sql", "metric_name": "gmv"})
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "ok"

    def test_execute_viewer_forbidden(self):
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_execution_compiler_blueprint(MagicMock(), runtime_service=MagicMock())
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        c = flask_app.test_client()
        resp = c.post(
            f"{BASE}/execute",
            json={"target_type": "sql"},
            headers={"Authorization": f"Bearer {_viewer_token()}"},
        )
        assert resp.status_code == 403


@pytest.mark.redesign
class TestExecutionCompilerAuth:
    def test_compile_preview_requires_auth(self):
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        bp = create_execution_compiler_blueprint(MagicMock())
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        resp = flask_app.test_client().post(f"{BASE}/compile-preview", json={})
        assert resp.status_code == 401
