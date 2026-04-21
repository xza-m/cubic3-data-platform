# app/domain/users/repositories.py
"""
用户域仓储抽象接口（W4.D-2）

具体实现见 ``app/infrastructure/users/repositories.py``。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.domain.users.role import Role
from app.domain.users.user import User


@dataclass
class UserListFilters:
    """用户列表查询过滤参数。"""

    page: int = 1
    size: int = 20
    q: Optional[str] = None
    status: Optional[str] = None  # "active" | "disabled" | None


@dataclass
class UserListResult:
    items: list[User] = field(default_factory=list)
    total: int = 0
    page: int = 1
    size: int = 20
    role_ids_by_user: dict[int, list[int]] = field(default_factory=dict)


class UserRepository(ABC):
    """用户聚合的持久化抽象。"""

    @abstractmethod
    def list(self, filters: UserListFilters) -> UserListResult: ...

    @abstractmethod
    def get(self, user_id: int) -> Optional[User]: ...

    @abstractmethod
    def get_by_username(self, username: str) -> Optional[User]: ...

    @abstractmethod
    def get_password_hash(self, user_id: int) -> Optional[str]: ...

    @abstractmethod
    def get_role_ids(self, user_id: int) -> list[int]: ...

    @abstractmethod
    def create(self, entity: User, password_hash: Optional[str] = None) -> User: ...

    @abstractmethod
    def update(self, user_id: int, patch: dict) -> Optional[User]: ...

    @abstractmethod
    def update_password(self, user_id: int, password_hash: str) -> None: ...

    @abstractmethod
    def update_last_login(self, user_id: int) -> None: ...

    @abstractmethod
    def delete(self, user_id: int) -> bool: ...

    @abstractmethod
    def assign_roles(self, user_id: int, role_codes: list[str]) -> list[Role]: ...

    @abstractmethod
    def get_roles(self, user_id: int) -> list[Role]: ...

    @abstractmethod
    def count(self) -> int: ...


class RoleRepository(ABC):
    """角色聚合的持久化抽象。"""

    @abstractmethod
    def list(self, q: Optional[str] = None) -> list[Role]: ...

    @abstractmethod
    def get(self, role_id: int) -> Optional[Role]: ...

    @abstractmethod
    def get_by_code(self, code: str) -> Optional[Role]: ...

    @abstractmethod
    def get_many_by_codes(self, codes: list[str]) -> list[Role]: ...

    @abstractmethod
    def create(self, entity: Role) -> Role: ...

    @abstractmethod
    def update(self, role_id: int, patch: dict) -> Optional[Role]: ...

    @abstractmethod
    def delete(self, role_id: int) -> bool: ...

    @abstractmethod
    def count_users(self, role_id: int) -> int: ...
