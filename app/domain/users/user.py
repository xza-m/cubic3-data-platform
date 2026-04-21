# app/domain/users/user.py
"""
用户领域实体（W4.D-2）

纯 dataclass，不绑定 SQLAlchemy。ORM 映射在
``app/infrastructure/users/models.py``，仓储实现在
``app/infrastructure/users/repositories.py``。

不变量：
    - ``username`` 非空，仅允许 lowercase letters / digits / underscore
    - ``status`` 取值 ``"active"`` 或 ``"disabled"``
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

USERNAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,31}$")
VALID_STATUSES = ("active", "disabled")


@dataclass
class User:
    """用户聚合根。"""

    id: Optional[int] = None
    username: str = ""
    display_name: Optional[str] = None
    email: Optional[str] = None
    status: str = "active"
    is_system: bool = False
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    role_codes: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.validate()

    # ------------------------------------------------------------------
    # 不变量校验
    # ------------------------------------------------------------------

    def validate(self) -> None:
        """检查实体不变量；违反时抛出 ``ValueError``。"""
        if not self.username:
            raise ValueError("username 不能为空")
        if not USERNAME_PATTERN.match(self.username):
            raise ValueError(
                "username 只能包含小写字母、数字、下划线，且必须以小写字母开头"
            )
        if self.status not in VALID_STATUSES:
            raise ValueError(f"status 必须是 {VALID_STATUSES} 之一: {self.status!r}")

    # ------------------------------------------------------------------
    # 业务行为
    # ------------------------------------------------------------------

    @property
    def is_active(self) -> bool:
        return self.status == "active"

    def disable(self) -> None:
        self.status = "disabled"

    def enable(self) -> None:
        self.status = "active"

    # ------------------------------------------------------------------
    # 序列化（API 层使用，对前端暴露 snake_case + is_active 兼容字段）
    # ------------------------------------------------------------------

    def to_dict(self, role_ids: Optional[list[int]] = None) -> dict:
        """序列化为 API 响应字典。

        Args:
            role_ids: 已由仓储层解析的角色 ID 列表（前端需要数字 ID）。
        """
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "email": self.email,
            "status": self.status,
            "is_active": self.is_active,
            "is_system": self.is_system,
            "role_ids": role_ids or [],
            "role_codes": list(self.role_codes),
            "last_login_at": _iso(self.last_login_at),
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None
