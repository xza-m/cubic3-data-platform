# app/interfaces/api/v1/user_preferences.py
"""
用户偏好 REST API（B-back-1）

路由：
  GET  /api/v1/users/me/preferences
  PUT  /api/v1/users/me/preferences
"""
from flask import Blueprint, g, request
from pydantic import ValidationError as PydanticValidationError

from app.application.users.preferences_service import (
    UpdatePreferencesRequest,
    UserPreferencesService,
)
from app.extensions import db
from app.infrastructure.repositories.user_preferences_repository import UserPreferencesRepository
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import bad_request, error, success
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint("user_preferences_api_v1", __name__, url_prefix="/api/v1/users/me/preferences")


def _get_service() -> UserPreferencesService:
    return UserPreferencesService(UserPreferencesRepository(db.session))


@bp.route("", methods=["GET"])
@require_auth
def get_preferences():
    """
    获取当前用户偏好。

    未配置时返回系统默认值（不 404）。

    Returns:
        200: { theme, default_landing, list_page_size, table_density, extra, updated_at }
    """
    user_id = g.user_id
    svc = _get_service()
    data = svc.get_preferences(int(user_id))
    return success(data=data)


@bp.route("", methods=["PUT"])
@require_auth
def update_preferences():
    """
    部分字段 merge 更新用户偏好。

    Request Body（所有字段均可选）：
        {
            "theme": "light | dark | system",
            "default_landing": "/dashboard",
            "list_page_size": 20,
            "table_density": "comfortable | compact",
            "extra": {}
        }

    Returns:
        200: 更新后的完整偏好对象
        400: 参数校验失败
        422: theme / table_density 值非法
    """
    user_id = g.user_id
    body = request.get_json(silent=True) or {}

    try:
        payload = UpdatePreferencesRequest(**body)
    except PydanticValidationError as exc:
        # pydantic errors 可能含不可序列化的 ctx 值，转为纯字符串
        errors = [
            {
                "field": ".".join(str(loc) for loc in e["loc"]),
                "msg": e["msg"],
                "type": e["type"],
            }
            for e in exc.errors()
        ]
        first_msg = errors[0]["msg"] if errors else str(exc)
        return error(
            message=f"请求参数验证失败: {first_msg}",
            status=422,
            details=errors,
        )

    svc = _get_service()
    data = svc.update_preferences(int(user_id), payload)
    return success(data=data, message="偏好更新成功")
