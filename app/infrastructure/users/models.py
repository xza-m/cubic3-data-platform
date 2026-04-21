# app/infrastructure/users/models.py
"""
用户域 SQLAlchemy ORM 模型（W4.D-2）

为了让 ``db.create_all()`` 在测试环境（SQLite 内存库）中能正确建表，
本模块的模型继承自 ``app.extensions.db.Model``。生产环境的真实建表
依赖 Alembic migration（见 ``20260420_05_add_users_roles.py``）。

设计要点：
    - ``users`` / ``roles`` 主键使用 ``BigInteger``（与 ``user_preferences`` 兼容）
    - ``user_roles`` 关联表带级联删除
    - ``user_passwords`` 拆出独立表存储 bcrypt hash，避免 list 接口意外泄漏
    - ``Role.permissions`` 用 JSON 列存储字符串数组，借助 ``JsonType`` 跨方言
"""
from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow

# 主键类型：PostgreSQL/MySQL 用 BIGINT 与生产兼容，SQLite 用 INTEGER 以触发
# ROWID 自动递增（BIGINT 在 SQLite 不会被识别为 ROWID alias，导致 autoincrement 失效）。
_BIG_PK = BigInteger().with_variant(Integer(), "sqlite")


class UserORM(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        Index("idx_users_status", "status"),
        {"extend_existing": True},
    )

    id = Column(_BIG_PK, primary_key=True, autoincrement=True)
    username = Column(String(64), nullable=False)
    display_name = Column(String(128), nullable=True)
    email = Column(String(255), nullable=True)
    status = Column(String(16), nullable=False, default="active", server_default="active")
    is_system = Column(Boolean, nullable=False, default=False, server_default="0")
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    roles = relationship(
        "RoleORM",
        secondary="user_roles",
        backref="users",
        lazy="select",
    )

    password = relationship(
        "UserPasswordORM",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<UserORM id={self.id} username={self.username!r} status={self.status!r}>"


class RoleORM(db.Model):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("code", name="uq_roles_code"),
        {"extend_existing": True},
    )

    id = Column(_BIG_PK, primary_key=True, autoincrement=True)
    code = Column(String(64), nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    permissions = Column(JsonType, nullable=False, default=list)
    is_system = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def __repr__(self) -> str:
        return f"<RoleORM id={self.id} code={self.code!r}>"


class UserRoleORM(db.Model):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        {"extend_existing": True},
    )

    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id = Column(
        BigInteger,
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at = Column(DateTime, nullable=False, default=utcnow)


class UserPasswordORM(db.Model):
    """密码 hash 单独存表，list/get 用户接口不会触达。"""

    __tablename__ = "user_passwords"
    __table_args__ = ({"extend_existing": True},)

    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    password_hash = Column(String(255), nullable=False)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
