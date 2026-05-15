"""Principal 展示名解析。

授权判断仍使用 principal_id；本模块只服务于用户界面展示，避免把
Feishu open_id / union_id 等技术主键直接暴露给普通业务页面。
"""
from __future__ import annotations

from typing import Any, Iterable

from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def normalize_identity(value: Any) -> str:
    return str(value or "").strip()


def is_principal_like(value: Any) -> bool:
    identity = normalize_identity(value)
    return identity.startswith(("feishu:", "svc:", "internal:", "ou_", "on_"))


def is_feishu_external_id(value: Any) -> bool:
    identity = normalize_identity(value)
    return identity.startswith(("ou_", "on_"))


def display_name_from_principal(row: Any) -> str | None:
    """从 Principal ORM 中取适合界面展示的姓名。"""

    if row is None:
        return None
    for attr in ("display_name", "email", "employee_no"):
        value = normalize_identity(getattr(row, attr, None))
        if value:
            return value
    return None


class PrincipalDisplayNameResolver:
    """按 principal_id 批量解析展示名。

    仓储异常不应影响业务列表加载。若 access_* 表尚未迁移或环境未初始化，
    调用方会收到空映射，前端再展示“未同步用户”。
    """

    def __init__(self, repository) -> None:
        self.repository = repository

    def resolve_many(self, identities: Iterable[Any]) -> dict[str, str]:
        principal_ids: list[str] = []
        external_ids: list[str] = []
        seen: set[str] = set()
        for value in identities:
            identity = normalize_identity(value)
            if not identity or identity in seen or not is_principal_like(identity):
                continue
            seen.add(identity)
            if is_feishu_external_id(identity):
                external_ids.append(identity)
            else:
                principal_ids.append(identity)
        if not principal_ids and not external_ids:
            return {}
        try:
            rows = self.repository.list_principals_by_ids(principal_ids)
            aliases = self.repository.list_aliases_by_external_ids(external_ids) if external_ids else []
            alias_principal_ids = [alias.principal_id for alias in aliases]
            alias_principals = self.repository.list_principals_by_ids(alias_principal_ids) if alias_principal_ids else []
        except Exception as exc:  # pragma: no cover - 防御未迁移环境
            logger.warning("principal_display_name_resolve_failed", error=str(exc))
            return {}

        result: dict[str, str] = {}
        for row in rows:
            display_name = display_name_from_principal(row)
            if display_name:
                result[row.principal_id] = display_name
        principals_by_id = {row.principal_id: row for row in alias_principals}
        for alias in aliases:
            display_name = display_name_from_principal(principals_by_id.get(alias.principal_id))
            if display_name:
                result[alias.external_id] = display_name
        return result

    def resolve_one(self, identity: Any) -> str | None:
        principal_id = normalize_identity(identity)
        return self.resolve_many([principal_id]).get(principal_id)
