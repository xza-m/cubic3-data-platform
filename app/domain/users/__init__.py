# app/domain/users/__init__.py
"""
用户域聚合（W4.D-2）

包含：
    - User / Role / Permission 实体（纯 dataclass，不绑定 ORM）
    - UserRepository / RoleRepository 抽象接口
"""
from app.domain.users.user import User, USERNAME_PATTERN
from app.domain.users.role import Role, ROLE_CODE_PATTERN
from app.domain.users.permission import Permission, SEED_PERMISSIONS, SEED_PERMISSION_CODES
from app.domain.users.repositories import UserRepository, RoleRepository

__all__ = [
    "User",
    "Role",
    "Permission",
    "USERNAME_PATTERN",
    "ROLE_CODE_PATTERN",
    "SEED_PERMISSIONS",
    "SEED_PERMISSION_CODES",
    "UserRepository",
    "RoleRepository",
]
