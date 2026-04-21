# app/domain/users/role.py
"""
角色领域实体（W4.D-2）

不变量：
    - ``code`` 是小写标识符（lowercase letters / digits / underscore）
    - ``name`` 非空（用户可读名）
    - ``permissions`` 中每个元素必须是受支持的权限码
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

ROLE_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,31}$")


@dataclass
class Role:
    """角色聚合根。"""

    id: Optional[int] = None
    code: str = ""
    name: str = ""
    description: Optional[str] = None
    permissions: list[str] = field(default_factory=list)
    is_system: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        self.validate()

    def validate(self) -> None:
        if not self.code:
            raise ValueError("role.code 不能为空")
        if not ROLE_CODE_PATTERN.match(self.code):
            raise ValueError(
                "role.code 只能包含小写字母、数字、下划线，且必须以小写字母开头"
            )
        if not self.name:
            raise ValueError("role.name 不能为空")
        if not isinstance(self.permissions, list):
            raise ValueError("role.permissions 必须是 list[str]")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "description": self.description,
            "permissions": list(self.permissions),
            "is_system": self.is_system,
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None
