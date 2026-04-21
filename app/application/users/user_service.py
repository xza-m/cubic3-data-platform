# app/application/users/user_service.py
"""
用户应用服务（W4.D-2）

负责编排用户聚合的应用用例：列表 / 详情 / 创建 / 更新 / 删除 / 角色分配。
仓储与密码哈希器以构造函数注入，方便单测以 mock 替换。
"""
from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional, Protocol

from app.domain.users.repositories import (
    RoleRepository,
    UserListFilters,
    UserRepository,
)
from app.domain.users.role import Role
from app.domain.users.user import USERNAME_PATTERN, User, VALID_STATUSES
from app.application.users.errors import (
    CannotDeleteSelfError,
    DuplicateUserError,
    RoleNotFoundError,
    SystemEntityProtectedError,
    UserNotFoundError,
    UserValidationError,
)


class PasswordHasher(Protocol):
    def hash(self, plain: str) -> str: ...
    def verify(self, plain: str, hashed: str) -> bool: ...


_VALID_LIST_STATUS = ("active", "disabled", "all")
_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 200


class UserService:
    """用户应用服务。"""

    def __init__(
        self,
        user_repo: UserRepository,
        role_repo: RoleRepository,
        password_hasher: PasswordHasher,
    ) -> None:
        self.user_repo = user_repo
        self.role_repo = role_repo
        self.hasher = password_hasher

    # ------------------------------------------------------------------
    # 查询
    # ------------------------------------------------------------------

    def list_users(
        self,
        page: int = 1,
        size: int = _DEFAULT_PAGE_SIZE,
        q: Optional[str] = None,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """分页列出用户。

        Returns:
            ``{"items": [user_dict, ...], "total": int, "page": int, "size": int}``
        """
        page = max(1, int(page or 1))
        size = max(1, min(_MAX_PAGE_SIZE, int(size or _DEFAULT_PAGE_SIZE)))

        normalized_status: Optional[str] = None
        if status is not None and status != "":
            if status not in _VALID_LIST_STATUS:
                raise UserValidationError(
                    f"status 必须是 {_VALID_LIST_STATUS} 之一", field="status"
                )
            if status != "all":
                normalized_status = status

        filters = UserListFilters(page=page, size=size, q=q, status=normalized_status)
        result = self.user_repo.list(filters)

        items: list[dict[str, Any]] = []
        for user in result.items:
            role_ids = result.role_ids_by_user.get(user.id, [])
            items.append(user.to_dict(role_ids=role_ids))

        return {
            "items": items,
            "total": result.total,
            "page": result.page,
            "size": result.size,
        }

    def get_user(self, user_id: int) -> dict[str, Any]:
        user = self.user_repo.get(user_id)
        if not user:
            raise UserNotFoundError(user_id)
        roles = self.user_repo.get_roles(user_id)
        user.role_codes = [r.code for r in roles]
        role_ids = [r.id for r in roles if r.id is not None]
        return user.to_dict(role_ids=role_ids)

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        username = (payload.get("username") or "").strip().lower()
        if not username:
            raise UserValidationError("username 不能为空", field="username")
        if not USERNAME_PATTERN.match(username):
            raise UserValidationError(
                "username 只能包含小写字母、数字、下划线，长度 2~32",
                field="username",
            )

        existing = self.user_repo.get_by_username(username)
        if existing:
            raise DuplicateUserError(username)

        password = payload.get("password")
        password_hash: Optional[str] = None
        if password:
            if len(password) < 6:
                raise UserValidationError("password 长度至少 6 位", field="password")
            password_hash = self.hasher.hash(password)

        status = self._normalize_status(payload)

        try:
            user = User(
                username=username,
                display_name=(payload.get("display_name") or None),
                email=(payload.get("email") or None),
                status=status,
                is_system=False,
            )
        except ValueError as exc:
            raise UserValidationError(str(exc)) from exc

        created = self.user_repo.create(user, password_hash=password_hash)

        # 角色分配（可选）
        role_codes = self._resolve_role_codes(payload)
        if role_codes:
            self.user_repo.assign_roles(created.id, role_codes)

        return self.get_user(created.id)

    def update_user(self, user_id: int, patch: dict[str, Any]) -> dict[str, Any]:
        user = self.user_repo.get(user_id)
        if not user:
            raise UserNotFoundError(user_id)

        clean_patch: dict[str, Any] = {}

        if "display_name" in patch:
            clean_patch["display_name"] = patch["display_name"] or None

        if "email" in patch:
            clean_patch["email"] = (patch["email"] or None)

        # status 支持两种入参：is_active(bool) 或 status(str)
        if "is_active" in patch:
            clean_patch["status"] = "active" if patch["is_active"] else "disabled"
        if "status" in patch:
            value = patch["status"]
            if value not in VALID_STATUSES:
                raise UserValidationError(
                    f"status 必须是 {VALID_STATUSES} 之一", field="status"
                )
            clean_patch["status"] = value

        # 密码更新（可选）
        if patch.get("password"):
            password = patch["password"]
            if len(password) < 6:
                raise UserValidationError("password 长度至少 6 位", field="password")
            self.user_repo.update_password(user_id, self.hasher.hash(password))

        if clean_patch:
            self.user_repo.update(user_id, clean_patch)

        return self.get_user(user_id)

    def delete_user(
        self, user_id: int, current_user_id: Optional[int] = None
    ) -> None:
        """删除用户。

        - 若是系统内置用户（``is_system=True``）则软删除（status='disabled'）
        - 否则硬删除
        - 不能删除自己
        """
        if (
            current_user_id is not None
            and str(current_user_id) == str(user_id)
        ):
            raise CannotDeleteSelfError(user_id)

        user = self.user_repo.get(user_id)
        if not user:
            raise UserNotFoundError(user_id)

        if user.is_system:
            self.user_repo.update(user_id, {"status": "disabled"})
            return

        self.user_repo.delete(user_id)

    def assign_roles(self, user_id: int, role_codes: list[str]) -> dict[str, Any]:
        """全量替换用户的角色绑定。"""
        if not isinstance(role_codes, list):
            raise UserValidationError("role_codes 必须是数组", field="role_codes")

        normalized = [str(c).strip().lower() for c in role_codes if str(c).strip()]
        normalized = list(dict.fromkeys(normalized))  # 去重保序

        if normalized:
            existing = self.role_repo.get_many_by_codes(normalized)
            existing_codes = {r.code for r in existing}
            missing = [c for c in normalized if c not in existing_codes]
            if missing:
                raise RoleNotFoundError(missing[0])

        user = self.user_repo.get(user_id)
        if not user:
            raise UserNotFoundError(user_id)

        self.user_repo.assign_roles(user_id, normalized)
        return self.get_user(user_id)

    # ------------------------------------------------------------------
    # 鉴权用辅助方法（供 auth.py 使用）
    # ------------------------------------------------------------------

    def authenticate(self, username: str, password: str) -> Optional[dict[str, Any]]:
        """密码认证；成功返回用户字典+role_codes，失败返回 None。"""
        if not username or not password:
            return None
        user = self.user_repo.get_by_username(username.strip().lower())
        if not user or not user.is_active:
            return None
        password_hash = self.user_repo.get_password_hash(user.id)
        if not password_hash or not self.hasher.verify(password, password_hash):
            return None
        try:
            self.user_repo.update_last_login(user.id)
        except Exception:
            pass
        roles = self.user_repo.get_roles(user.id)
        user.role_codes = [r.code for r in roles]
        return user.to_dict(role_ids=[r.id for r in roles if r.id is not None])

    def has_any_user(self) -> bool:
        return self.user_repo.count() > 0

    # ------------------------------------------------------------------
    # 内部辅助
    # ------------------------------------------------------------------

    def _normalize_status(self, payload: dict[str, Any]) -> str:
        if "status" in payload and payload["status"]:
            value = payload["status"]
            if value not in VALID_STATUSES:
                raise UserValidationError(
                    f"status 必须是 {VALID_STATUSES} 之一", field="status"
                )
            return value
        if "is_active" in payload and payload["is_active"] is not None:
            return "active" if payload["is_active"] else "disabled"
        return "active"

    def _resolve_role_codes(self, payload: dict[str, Any]) -> list[str]:
        """同时支持 ``role_codes`` 与 ``role_ids`` 两种入参。"""
        if "role_codes" in payload and payload["role_codes"]:
            codes = [str(c).strip().lower() for c in payload["role_codes"] if c]
        elif "role_ids" in payload and payload["role_ids"]:
            roles = [self.role_repo.get(int(rid)) for rid in payload["role_ids"]]
            for rid, role in zip(payload["role_ids"], roles):
                if role is None:
                    raise RoleNotFoundError(int(rid))
            codes = [r.code for r in roles if r]
        else:
            return []
        return list(dict.fromkeys(codes))


__all__ = ["UserService", "PasswordHasher"]
# silence "unused" lint
_ = asdict, SystemEntityProtectedError
