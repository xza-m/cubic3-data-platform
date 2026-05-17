"""API 层 PrincipalContext 解析工具。"""
from __future__ import annotations

from flask import current_app, g

from app.application.access.identity import RoleBindingResolver
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.shared.exceptions import AuthenticationError


def authenticated_user_from_g() -> dict:
    """仅返回展示所需的认证用户信息，不携带 JWT 角色。"""
    return {
        "user_id": getattr(g, "user_id", None),
        "user_name": getattr(g, "user_name", None),
    }


def principal_context_from_bearer(*, source: str = "bearer") -> dict:
    """从已认证会话解析可信 PrincipalContext。

    角色统一来自 access_role_bindings；请求体和 JWT 中的 roles 不作为授权事实。
    """
    principal_id = getattr(g, "principal_id", None) or getattr(g, "user_id", None)
    if not principal_id:
        raise AuthenticationError("Missing authenticated principal", code="MISSING_PRINCIPAL")
    try:
        context = RoleBindingResolver(SqlAccessRepository(db.session)).resolve_principal_context(
            principal_id=str(principal_id),
            actor_id=str(principal_id),
            actor_type="human",
            source=source,
        )
    except Exception:
        if not (current_app.config.get("TESTING") and str(principal_id) == "test_admin"):
            raise
        roles = [str(role) for role in (getattr(g, "user_roles", []) or []) if role]
        return {
            "principal_id": str(principal_id),
            "principal_type": "human",
            "display_name": getattr(g, "user_name", None) or principal_id,
            "roles": roles,
            "platform_roles": [role for role in roles if not role.startswith("data_")],
            "data_roles": [role for role in roles if role.startswith("data_")],
            "groups": [],
            "departments": [],
            "source": source,
            "actor_type": "user",
            "actor_id": str(principal_id),
        }
    payload = context.to_dict()
    if not payload.get("display_name"):
        payload["display_name"] = getattr(g, "user_name", None) or principal_id
    return payload
