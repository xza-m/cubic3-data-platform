"""Access Principal 偏好 REST API。"""
from __future__ import annotations

from flask import Blueprint, g, request
from pydantic import ValidationError as PydanticValidationError

from app.application.access.preferences import (
    PrincipalPreferencesService,
    UpdatePrincipalPreferencesRequest,
)
from app.extensions import db
from app.infrastructure.access.preferences_repository import PrincipalPreferencesRepository
from app.interfaces.api.middleware.auth import require_identity
from app.shared.response import error, success

bp = Blueprint(
    "access_preferences_api_v1",
    __name__,
    url_prefix="/api/v1/access/me/preferences",
)


def _get_service() -> PrincipalPreferencesService:
    return PrincipalPreferencesService(PrincipalPreferencesRepository(db.session))


@bp.route("", methods=["GET"])
@require_identity
def get_preferences():
    principal_id = g.principal_id
    data = _get_service().get_preferences(principal_id)
    return success(data=data)


@bp.route("", methods=["PUT"])
@require_identity
def update_preferences():
    body = request.get_json(silent=True) or {}
    try:
        payload = UpdatePrincipalPreferencesRequest(**body)
    except PydanticValidationError as exc:
        errors = [
            {
                "field": ".".join(str(loc) for loc in item["loc"]),
                "msg": item["msg"],
                "type": item["type"],
            }
            for item in exc.errors()
        ]
        first_msg = errors[0]["msg"] if errors else str(exc)
        return error(
            message=f"请求参数验证失败: {first_msg}",
            status=422,
            details=errors,
        )

    data = _get_service().update_preferences(g.principal_id, payload)
    return success(data=data, message="偏好更新成功")
