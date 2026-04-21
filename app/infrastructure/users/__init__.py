# app/infrastructure/users/__init__.py
"""
用户域基础设施层（W4.D-2）

包含：
    - ORM 模型（``models.py``）
    - 密码哈希器（``password.py``）
    - 仓储实现（``repositories.py``）
"""
from app.infrastructure.users.models import UserORM, RoleORM, UserRoleORM, UserPasswordORM
from app.infrastructure.users.password import BcryptHasher
from app.infrastructure.users.repositories import (
    SqlUserRepository,
    SqlRoleRepository,
)

__all__ = [
    "UserORM",
    "RoleORM",
    "UserRoleORM",
    "UserPasswordORM",
    "BcryptHasher",
    "SqlUserRepository",
    "SqlRoleRepository",
]
