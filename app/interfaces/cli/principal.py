"""--principal 解析：principal_id → PrincipalContext（DB-backed RoleBindingResolver）。

P1 只读命令不强制 principal；此模块供 `me` 自检与后续 P2/P3 写域复用真实角色解析。
解析走 access_role_bindings（与 middleware/auth.py、free_sql_guard.py 同口径）。
"""
from __future__ import annotations

from typing import Any, Dict


def resolve_principal(principal_id: str | None) -> Dict[str, Any]:
    if not principal_id:
        return {
            "principal_id": None,
            "anonymous": True,
            "note": "未传 --principal；P1 只读命令不强制身份",
        }

    from app.application.access.identity import RoleBindingResolver
    from app.extensions import db
    from app.infrastructure.access.repositories import SqlAccessRepository

    resolver = RoleBindingResolver(SqlAccessRepository(db.session))
    context = resolver.resolve_principal_context(principal_id=principal_id)
    return context.to_dict()


def principal_context_or_none(principal_id: str | None) -> Dict[str, Any] | None:
    """供 route/plan 等用：有 --principal 则解析为 PrincipalContext dict，否则 None（匿名）。"""
    return resolve_principal(principal_id) if principal_id else None
