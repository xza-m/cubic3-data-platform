# app/application/users/role_service.py
"""
角色应用服务（W4.D-2）

负责角色 CRUD 与权限校验。删除角色前检查是否仍被用户引用。
"""
from __future__ import annotations

import re
from typing import Any, Optional

from app.domain.users.permission import SEED_PERMISSION_CODES
from app.domain.users.repositories import RoleRepository
from app.domain.users.role import ROLE_CODE_PATTERN, Role
from app.application.users.errors import (
    DuplicateRoleError,
    RoleInUseError,
    RoleNotFoundError,
    SystemEntityProtectedError,
    UserValidationError,
)


class RoleService:
    """角色应用服务。"""

    def __init__(self, role_repo: RoleRepository) -> None:
        self.role_repo = role_repo

    # ------------------------------------------------------------------
    # 查询
    # ------------------------------------------------------------------

    def list_roles(self, q: Optional[str] = None) -> list[dict[str, Any]]:
        roles = self.role_repo.list(q=q)
        return [self._serialize(r) for r in roles]

    def get_role(self, role_id: int) -> dict[str, Any]:
        role = self.role_repo.get(role_id)
        if not role:
            raise RoleNotFoundError(role_id)
        return self._serialize(role)

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    def create_role(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = (payload.get("name") or "").strip()
        if not name:
            raise UserValidationError("name 不能为空", field="name")

        code = (payload.get("code") or "").strip().lower()
        if not code:
            code = _slugify_to_code(name)
            if not code:
                raise UserValidationError(
                    "无法从 name 生成 code，请显式提供 code", field="code"
                )

        if not ROLE_CODE_PATTERN.match(code):
            raise UserValidationError(
                "code 只能包含小写字母、数字、下划线，且必须以小写字母开头",
                field="code",
            )

        if self.role_repo.get_by_code(code):
            raise DuplicateRoleError(code)

        permissions = self._validate_permissions(payload.get("permissions") or [])

        try:
            role = Role(
                code=code,
                name=name,
                description=(payload.get("description") or None),
                permissions=permissions,
                is_system=False,
            )
        except ValueError as exc:
            raise UserValidationError(str(exc)) from exc

        created = self.role_repo.create(role)
        return self._serialize(created)

    def update_role(self, role_id: int, patch: dict[str, Any]) -> dict[str, Any]:
        role = self.role_repo.get(role_id)
        if not role:
            raise RoleNotFoundError(role_id)
        if role.is_system and ("code" in patch or "permissions" in patch):
            # 允许修改名字 / 描述，但不允许改动 code / permissions（避免破坏 RBAC）
            forbidden = [k for k in ("code", "permissions") if k in patch]
            raise SystemEntityProtectedError(f"role {role.code}（不可修改 {forbidden}）")

        clean_patch: dict[str, Any] = {}

        if "name" in patch:
            name = (patch["name"] or "").strip()
            if not name:
                raise UserValidationError("name 不能为空", field="name")
            clean_patch["name"] = name

        if "description" in patch:
            clean_patch["description"] = patch["description"] or None

        if "permissions" in patch:
            clean_patch["permissions"] = self._validate_permissions(
                patch["permissions"] or []
            )

        if "code" in patch:
            new_code = (patch["code"] or "").strip().lower()
            if new_code != role.code:
                if not ROLE_CODE_PATTERN.match(new_code):
                    raise UserValidationError("code 格式非法", field="code")
                if self.role_repo.get_by_code(new_code):
                    raise DuplicateRoleError(new_code)
                clean_patch["code"] = new_code

        if not clean_patch:
            return self._serialize(role)

        updated = self.role_repo.update(role_id, clean_patch)
        if not updated:
            raise RoleNotFoundError(role_id)
        return self._serialize(updated)

    def delete_role(self, role_id: int) -> None:
        role = self.role_repo.get(role_id)
        if not role:
            raise RoleNotFoundError(role_id)
        if role.is_system:
            raise SystemEntityProtectedError(f"role {role.code}")

        in_use = self.role_repo.count_users(role_id)
        if in_use > 0:
            raise RoleInUseError(role_id, in_use)

        self.role_repo.delete(role_id)

    def count_users_in_role(self, role_id: int) -> int:
        if not self.role_repo.get(role_id):
            raise RoleNotFoundError(role_id)
        return self.role_repo.count_users(role_id)

    # ------------------------------------------------------------------
    # 内部辅助
    # ------------------------------------------------------------------

    @staticmethod
    def _serialize(role: Role) -> dict[str, Any]:
        return role.to_dict()

    @staticmethod
    def _validate_permissions(values: Any) -> list[str]:
        if not isinstance(values, list):
            raise UserValidationError("permissions 必须是数组", field="permissions")
        normalized = [str(v).strip() for v in values if str(v).strip()]
        unknown = [v for v in normalized if v not in SEED_PERMISSION_CODES]
        if unknown:
            raise UserValidationError(
                f"未知的权限码: {unknown[:3]}…" if len(unknown) > 3 else
                f"未知的权限码: {unknown}",
                field="permissions",
            )
        return list(dict.fromkeys(normalized))


_SLUG_RE = re.compile(r"[^a-z0-9_]+")


def _slugify_to_code(name: str) -> str:
    """将任意可读名转换为合法的 role code（小写、下划线分隔）。"""
    base = name.strip().lower()
    base = _SLUG_RE.sub("_", base)
    base = base.strip("_")
    if not base:
        return ""
    if not base[0].isalpha():
        base = f"r_{base}"
    return base[:32]


__all__ = ["RoleService"]
