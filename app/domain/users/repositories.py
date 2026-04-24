# app/domain/users/repositories.py
"""
用户域仓储抽象接口（W4.D-2）

具体实现见 ``app/infrastructure/users/repositories.py``。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from app.domain.users.role import Role
from app.domain.users.user import User


@dataclass
class LoginEventRecord:
    """登录事件（领域层的简化模型，对应 ``user_login_events`` 表）"""

    id: Optional[int] = None
    user_id: int = 0
    status: str = "success"  # "success" | "failed"
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    error_reason: Optional[str] = None
    logged_at: Optional[datetime] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "status": self.status,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "error_reason": self.error_reason,
            "logged_at": self.logged_at.isoformat() if self.logged_at else None,
        }


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

    # ---- 登录事件（B-8）----

    @abstractmethod
    def add_login_event(self, event: LoginEventRecord) -> LoginEventRecord: ...

    @abstractmethod
    def list_login_events(
        self, user_id: int, page: int = 1, size: int = 20
    ) -> tuple[list[LoginEventRecord], int]: ...


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
