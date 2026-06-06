"""语义建设工作台 Build Project API。"""
from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Dict

from flask import Blueprint, current_app, g, request

try:
    from app.interfaces.api.middleware.auth import require_identity  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - 兼容旧认证命名
    from app.interfaces.api.middleware.auth import require_auth as require_identity  # type: ignore[no-redef]
from app.shared.response import error, success


def _require_identity_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    """测试环境允许直接注入 stub，正式环境要求已登录身份。"""

    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_identity(func)(*args, **kwargs)

    return wrapper


def create_semantic_modeling_workbench_blueprint(service: Any) -> Blueprint:
    bp = Blueprint(
        "semantic_modeling_workbench",
        __name__,
        url_prefix="/api/v1/semantic/modeling-workbench",
    )

    def _body() -> Dict[str, Any]:
        return request.get_json(silent=True) or {}

    def _principal_id() -> str | None:
        return getattr(g, "principal_id", None)

    def _require_non_blank(payload: Dict[str, Any], field: str) -> None:
        if field in payload and not str(payload.get(field) or "").strip():
            raise ValueError(f"{field} 不能为空")

    def _project_payload() -> Dict[str, Any]:
        payload = _body()
        _require_non_blank(payload, "name")
        _require_non_blank(payload, "business_domain")
        return payload

    def _limit() -> int:
        raw_limit = request.args.get("limit", 50)
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError) as exc:
            raise ValueError("limit 必须在 1 到 100 之间") from exc
        if limit < 1 or limit > 100:
            raise ValueError("limit 必须在 1 到 100 之间")
        return limit

    def _workbench_error(operation: str, exc: Exception):
        if isinstance(exc, PermissionError):
            return error(
                str(exc),
                status=403,
                details={"code": "MODELING_WORKBENCH_FORBIDDEN"},
            )
        if isinstance(exc, LookupError):
            return error(
                str(exc),
                status=404,
                details={"code": "MODELING_WORKBENCH_NOT_FOUND"},
            )
        if isinstance(exc, ValueError):
            return error(
                str(exc),
                status=422,
                details={"code": "MODELING_WORKBENCH_VALIDATION_ERROR"},
            )
        current_app.logger.exception("semantic modeling workbench %s failed", operation)
        return error(
            f"{operation}失败",
            status=500,
            details={"code": "MODELING_WORKBENCH_INTERNAL_ERROR"},
        )

    @bp.get("/projects")
    @_require_identity_unless_testing
    def list_projects():
        try:
            limit = _limit()
            return success(
                data=service.list_projects(
                    principal_id=_principal_id(),
                    limit=limit,
                )
            )
        except Exception as exc:
            return _workbench_error("列出语义建设项目", exc)

    @bp.post("/projects")
    @_require_identity_unless_testing
    def create_project():
        try:
            return success(
                data=service.create_project(
                    _project_payload(),
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("创建语义建设项目", exc)

    @bp.get("/projects/<project_id>")
    @_require_identity_unless_testing
    def get_project(project_id: str):
        try:
            return success(
                data=service.get_project(
                    project_id,
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("获取语义建设项目", exc)

    @bp.post("/projects/<project_id>/scan")
    @_require_identity_unless_testing
    def scan_project(project_id: str):
        try:
            return success(
                data=service.scan_project(
                    project_id,
                    _body(),
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("扫描语义建设项目", exc)

    @bp.get("/projects/<project_id>/packages/<package_id>")
    @_require_identity_unless_testing
    def get_asset_package(project_id: str, package_id: str):
        try:
            return success(
                data=service.get_asset_package(
                    project_id,
                    package_id,
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("获取语义候选资产", exc)

    @bp.patch("/projects/<project_id>/packages/<package_id>")
    @_require_identity_unless_testing
    def update_asset_package(project_id: str, package_id: str):
        try:
            return success(
                data=service.update_asset_package(
                    project_id,
                    package_id,
                    _body(),
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("更新语义候选资产", exc)

    @bp.post("/projects/<project_id>/packages/<package_id>/actions")
    @_require_identity_unless_testing
    def apply_asset_package_action(project_id: str, package_id: str):
        try:
            return success(
                data=service.apply_asset_package_action(
                    project_id,
                    package_id,
                    _body(),
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("执行语义候选资产操作", exc)

    return bp
