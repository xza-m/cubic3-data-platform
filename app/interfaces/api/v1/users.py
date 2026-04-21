# app/interfaces/api/v1/users.py
"""
用户管理 REST API（W4.D-2）

路由：
    GET    /api/v1/users           列表
    POST   /api/v1/users           创建（admin）
    GET    /api/v1/users/<id>      详情
    PUT    /api/v1/users/<id>      更新（admin）
    DELETE /api/v1/users/<id>      删除（admin）
    PUT    /api/v1/users/<id>/roles  分配角色（admin）

RBAC：
    - GET 路由仅要求 ``@require_auth``
    - 写路由要求 ``@require_admin``（当前用户角色必须包含 ``"admin"``）
"""
from __future__ import annotations

from functools import wraps
from typing import Any

from flask import Blueprint, g, jsonify, request

from app.application.users.user_service import UserService
from app.extensions import db
from app.infrastructure.users.password import BcryptHasher
from app.infrastructure.users.repositories import (
    SqlRoleRepository,
    SqlUserRepository,
)
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import bad_request, created, error, success
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint("users_api_v1", __name__, url_prefix="/api/v1/users")


# ============================================================================
# 本地 require_admin（W4.D-1 中间件落地后可改为统一导入）
# ============================================================================

def require_admin(func):
    @wraps(func)
    @require_auth
    def wrapper(*args, **kwargs):
        roles = getattr(g, "user_roles", None) or []
        if "admin" not in roles:
            return jsonify({
                "code": -1,
                "message": "需要管理员权限",
                "error_code": "FORBIDDEN",
            }), 403
        return func(*args, **kwargs)
    return wrapper


# ============================================================================
# 服务工厂：与 user_preferences 一致使用 Flask db.session
# ============================================================================

def _user_repo() -> SqlUserRepository:
    return SqlUserRepository(db.session)


def _role_repo() -> SqlRoleRepository:
    return SqlRoleRepository(db.session)


def _service() -> UserService:
    return UserService(_user_repo(), _role_repo(), BcryptHasher())


def _payload() -> dict[str, Any]:
    return request.get_json(silent=True) or {}


def _handle_business_error(exc: Exception):
    """将业务异常翻成 4xx 响应。"""
    from app.application.users.errors import (
        DuplicateRoleError,
        DuplicateUserError,
        RoleInUseError,
        SystemEntityProtectedError,
    )

    if isinstance(exc, (DuplicateUserError, DuplicateRoleError)):
        return jsonify({
            "code": -1,
            "message": exc.message,
            "error_code": exc.code,
            "details": exc.details,
        }), 409
    if isinstance(exc, (RoleInUseError, SystemEntityProtectedError)):
        return jsonify({
            "code": -1,
            "message": exc.message,
            "error_code": exc.code,
            "details": exc.details,
        }), 400
    raise exc  # 让全局错误处理器接管


# ============================================================================
# 路由
# ============================================================================

@bp.route("", methods=["GET"])
@require_auth
def list_users():
    """GET /api/v1/users — 分页列表 + 关键词 + 状态过滤。"""
    page = request.args.get("page", 1, type=int)
    size = request.args.get("size", request.args.get("page_size", 20, type=int), type=int)
    q = request.args.get("q") or None
    status = request.args.get("status") or None

    is_active_str = request.args.get("is_active")
    if status is None and is_active_str is not None:
        status = "active" if is_active_str.lower() == "true" else "disabled"

    try:
        result = _service().list_users(page=page, size=size, q=q, status=status)
    except Exception as exc:  # noqa: BLE001
        return _handle_business_error(exc)

    return success(data=result)


@bp.route("/<int:user_id>", methods=["GET"])
@require_auth
def get_user(user_id: int):
    data = _service().get_user(user_id)
    return success(data=data)


@bp.route("", methods=["POST"])
@require_admin
def create_user():
    body = _payload()
    if not body:
        return bad_request("请求体不能为空")
    try:
        data = _service().create_user(body)
    except Exception as exc:
        return _handle_business_error(exc)
    return created(data=data, message="用户创建成功")


@bp.route("/<int:user_id>", methods=["PUT"])
@require_admin
def update_user(user_id: int):
    body = _payload()
    if not body:
        return bad_request("请求体不能为空")
    try:
        data = _service().update_user(user_id, body)
    except Exception as exc:
        return _handle_business_error(exc)
    return success(data=data, message="用户更新成功")


@bp.route("/<int:user_id>/roles", methods=["PUT"])
@require_admin
def assign_user_roles(user_id: int):
    body = _payload()
    role_codes = body.get("role_codes")

    if role_codes is None and "role_ids" in body:
        role_ids = body["role_ids"] or []
        if not isinstance(role_ids, list):
            return bad_request("role_ids 必须是数组")
        role_repo = _role_repo()
        role_codes = []
        for rid in role_ids:
            try:
                rid_int = int(rid)
            except (TypeError, ValueError):
                return bad_request(f"role_id {rid!r} 格式非法")
            role = role_repo.get(rid_int)
            if role is None:
                return error(f"角色 {rid_int} 不存在", status=404)
            role_codes.append(role.code)

    if role_codes is None:
        return bad_request("缺少 role_codes 或 role_ids 字段")

    try:
        data = _service().assign_roles(user_id, role_codes)
    except Exception as exc:
        return _handle_business_error(exc)
    return success(data=data, message="角色分配成功")


@bp.route("/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id: int):
    current_user_id = getattr(g, "user_id", None)
    try:
        _service().delete_user(user_id, current_user_id=current_user_id)
    except Exception as exc:
        return _handle_business_error(exc)
    return success(message="用户删除成功")
