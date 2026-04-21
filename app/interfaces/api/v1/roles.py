# app/interfaces/api/v1/roles.py
"""
角色管理 REST API（W4.D-2）

路由：
    GET    /api/v1/roles       列表
    POST   /api/v1/roles       创建（admin）
    GET    /api/v1/roles/<id>  详情
    PUT    /api/v1/roles/<id>  更新（admin）
    DELETE /api/v1/roles/<id>  删除（admin）

附带 GET /api/v1/permissions：列出所有可分配的权限码（前端表单使用）。
"""
from __future__ import annotations

from flask import Blueprint, request

from app.application.users.role_service import RoleService
from app.domain.users.permission import SEED_PERMISSIONS
from app.extensions import db
from app.infrastructure.users.repositories import SqlRoleRepository
from app.interfaces.api.middleware.auth import require_auth
from app.interfaces.api.v1.users import _handle_business_error, require_admin
from app.shared.response import bad_request, created, success
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint("roles_api_v1", __name__, url_prefix="/api/v1/roles")
permissions_bp = Blueprint("permissions_api_v1", __name__, url_prefix="/api/v1/permissions")


def _service() -> RoleService:
    return RoleService(SqlRoleRepository(db.session))


@bp.route("", methods=["GET"])
@require_auth
def list_roles():
    q = request.args.get("q") or None
    items = _service().list_roles(q=q)
    # 与现有列表 API 保持一致的分页信封（即使无分页也提供 total / page）
    return success(data={
        "items": items,
        "total": len(items),
        "page": 1,
        "size": len(items),
    })


@bp.route("/<int:role_id>", methods=["GET"])
@require_auth
def get_role(role_id: int):
    return success(data=_service().get_role(role_id))


@bp.route("", methods=["POST"])
@require_admin
def create_role():
    body = request.get_json(silent=True) or {}
    if not body:
        return bad_request("请求体不能为空")
    try:
        data = _service().create_role(body)
    except Exception as exc:
        return _handle_business_error(exc)
    return created(data=data, message="角色创建成功")


@bp.route("/<int:role_id>", methods=["PUT"])
@require_admin
def update_role(role_id: int):
    body = request.get_json(silent=True) or {}
    if not body:
        return bad_request("请求体不能为空")
    try:
        data = _service().update_role(role_id, body)
    except Exception as exc:
        return _handle_business_error(exc)
    return success(data=data, message="角色更新成功")


@bp.route("/<int:role_id>", methods=["DELETE"])
@require_admin
def delete_role(role_id: int):
    try:
        _service().delete_role(role_id)
    except Exception as exc:
        return _handle_business_error(exc)
    return success(message="角色删除成功")


# ----------------------------------------------------------------------------
# /api/v1/permissions — 列出可分配权限（前端建角色时使用）
# ----------------------------------------------------------------------------

@permissions_bp.route("", methods=["GET"])
@require_auth
def list_permissions():
    return success(data={"items": [p.to_dict() for p in SEED_PERMISSIONS]})
