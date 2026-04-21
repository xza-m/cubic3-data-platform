# app/infrastructure/users/repositories.py
"""
用户域 SQLAlchemy 仓储实现（W4.D-2）

ORM ↔ Domain 之间手工映射，避免领域层依赖 SQLAlchemy。
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.domain.users.repositories import (
    RoleRepository,
    UserListFilters,
    UserListResult,
    UserRepository,
)
from app.domain.users.role import Role
from app.domain.users.user import User
from app.infrastructure.users.models import (
    RoleORM,
    UserORM,
    UserPasswordORM,
    UserRoleORM,
)
from app.shared.utils.time import utcnow


# ============================================================================
# 映射工具
# ============================================================================

def _user_from_orm(orm: UserORM, role_codes: Optional[list[str]] = None) -> User:
    return User(
        id=orm.id,
        username=orm.username,
        display_name=orm.display_name,
        email=orm.email,
        status=orm.status,
        is_system=bool(orm.is_system),
        last_login_at=orm.last_login_at,
        created_at=orm.created_at,
        updated_at=orm.updated_at,
        role_codes=role_codes if role_codes is not None else [],
    )


def _role_from_orm(orm: RoleORM) -> Role:
    return Role(
        id=orm.id,
        code=orm.code,
        name=orm.name,
        description=orm.description,
        permissions=list(orm.permissions or []),
        is_system=bool(orm.is_system),
        created_at=orm.created_at,
        updated_at=orm.updated_at,
    )


# ============================================================================
# 用户仓储
# ============================================================================

class SqlUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    # -------- 查询 --------

    def list(self, filters: UserListFilters) -> UserListResult:
        q = self.session.query(UserORM)

        if filters.q:
            kw = f"%{filters.q.strip().lower()}%"
            q = q.filter(
                or_(
                    func.lower(UserORM.username).like(kw),
                    func.lower(UserORM.display_name).like(kw),
                    func.lower(UserORM.email).like(kw),
                )
            )
        if filters.status:
            q = q.filter(UserORM.status == filters.status)

        total = q.count()

        page = max(1, filters.page)
        size = max(1, filters.size)
        offset = (page - 1) * size

        rows = (
            q.order_by(UserORM.id.asc())
            .options(selectinload(UserORM.roles))
            .offset(offset)
            .limit(size)
            .all()
        )

        items: list[User] = []
        role_ids_by_user: dict[int, list[int]] = {}
        for row in rows:
            roles = list(row.roles or [])
            role_ids_by_user[row.id] = [r.id for r in roles]
            items.append(_user_from_orm(row, role_codes=[r.code for r in roles]))

        return UserListResult(
            items=items,
            total=total,
            page=page,
            size=size,
            role_ids_by_user=role_ids_by_user,
        )

    def get(self, user_id: int) -> Optional[User]:
        orm = self.session.get(UserORM, user_id)
        if not orm:
            return None
        return _user_from_orm(orm, role_codes=[r.code for r in (orm.roles or [])])

    def get_by_username(self, username: str) -> Optional[User]:
        if not username:
            return None
        orm = (
            self.session.query(UserORM)
            .filter(UserORM.username == username.strip().lower())
            .first()
        )
        if not orm:
            return None
        return _user_from_orm(orm, role_codes=[r.code for r in (orm.roles or [])])

    def get_password_hash(self, user_id: int) -> Optional[str]:
        row = self.session.get(UserPasswordORM, user_id)
        return row.password_hash if row else None

    def get_role_ids(self, user_id: int) -> list[int]:
        rows = (
            self.session.query(UserRoleORM.role_id)
            .filter(UserRoleORM.user_id == user_id)
            .all()
        )
        return [r.role_id for r in rows]

    def get_roles(self, user_id: int) -> list[Role]:
        rows = (
            self.session.query(RoleORM)
            .join(UserRoleORM, UserRoleORM.role_id == RoleORM.id)
            .filter(UserRoleORM.user_id == user_id)
            .order_by(RoleORM.id.asc())
            .all()
        )
        return [_role_from_orm(r) for r in rows]

    def count(self) -> int:
        return self.session.query(func.count(UserORM.id)).scalar() or 0

    # -------- 写入 --------

    def create(self, entity: User, password_hash: Optional[str] = None) -> User:
        orm = UserORM(
            username=entity.username,
            display_name=entity.display_name,
            email=entity.email,
            status=entity.status,
            is_system=bool(entity.is_system),
        )
        self.session.add(orm)
        self.session.flush()
        if password_hash:
            self.session.add(
                UserPasswordORM(user_id=orm.id, password_hash=password_hash)
            )
        self.session.commit()
        self.session.refresh(orm)
        return _user_from_orm(orm)

    def update(self, user_id: int, patch: dict) -> Optional[User]:
        orm = self.session.get(UserORM, user_id)
        if not orm:
            return None
        for key in ("display_name", "email", "status"):
            if key in patch:
                setattr(orm, key, patch[key])
        orm.updated_at = utcnow()
        self.session.commit()
        self.session.refresh(orm)
        return _user_from_orm(orm, role_codes=[r.code for r in (orm.roles or [])])

    def update_password(self, user_id: int, password_hash: str) -> None:
        row = self.session.get(UserPasswordORM, user_id)
        if row:
            row.password_hash = password_hash
            row.updated_at = utcnow()
        else:
            self.session.add(
                UserPasswordORM(user_id=user_id, password_hash=password_hash)
            )
        self.session.commit()

    def update_last_login(self, user_id: int) -> None:
        orm = self.session.get(UserORM, user_id)
        if not orm:
            return
        orm.last_login_at = utcnow()
        self.session.commit()

    def delete(self, user_id: int) -> bool:
        orm = self.session.get(UserORM, user_id)
        if not orm:
            return False
        self.session.delete(orm)
        self.session.commit()
        return True

    def assign_roles(self, user_id: int, role_codes: list[str]) -> list[Role]:
        # 删除旧绑定
        self.session.query(UserRoleORM).filter(UserRoleORM.user_id == user_id).delete()
        if role_codes:
            roles = (
                self.session.query(RoleORM)
                .filter(RoleORM.code.in_(list(set(role_codes))))
                .all()
            )
            for role in roles:
                self.session.add(UserRoleORM(user_id=user_id, role_id=role.id))
            self.session.commit()
            return [_role_from_orm(r) for r in roles]
        self.session.commit()
        return []


# ============================================================================
# 角色仓储
# ============================================================================

class SqlRoleRepository(RoleRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self, q: Optional[str] = None) -> list[Role]:
        query = self.session.query(RoleORM)
        if q:
            kw = f"%{q.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(RoleORM.code).like(kw),
                    func.lower(RoleORM.name).like(kw),
                )
            )
        rows = query.order_by(RoleORM.id.asc()).all()
        return [_role_from_orm(r) for r in rows]

    def get(self, role_id: int) -> Optional[Role]:
        orm = self.session.get(RoleORM, role_id)
        return _role_from_orm(orm) if orm else None

    def get_by_code(self, code: str) -> Optional[Role]:
        if not code:
            return None
        orm = (
            self.session.query(RoleORM)
            .filter(RoleORM.code == code.strip().lower())
            .first()
        )
        return _role_from_orm(orm) if orm else None

    def get_many_by_codes(self, codes: list[str]) -> list[Role]:
        if not codes:
            return []
        rows = (
            self.session.query(RoleORM)
            .filter(RoleORM.code.in_(list(set(codes))))
            .all()
        )
        return [_role_from_orm(r) for r in rows]

    def create(self, entity: Role) -> Role:
        orm = RoleORM(
            code=entity.code,
            name=entity.name,
            description=entity.description,
            permissions=list(entity.permissions or []),
            is_system=bool(entity.is_system),
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return _role_from_orm(orm)

    def update(self, role_id: int, patch: dict) -> Optional[Role]:
        orm = self.session.get(RoleORM, role_id)
        if not orm:
            return None
        for key in ("code", "name", "description", "permissions"):
            if key in patch:
                setattr(orm, key, patch[key])
        orm.updated_at = utcnow()
        self.session.commit()
        self.session.refresh(orm)
        return _role_from_orm(orm)

    def delete(self, role_id: int) -> bool:
        orm = self.session.get(RoleORM, role_id)
        if not orm:
            return False
        self.session.delete(orm)
        self.session.commit()
        return True

    def count_users(self, role_id: int) -> int:
        return (
            self.session.query(func.count(UserRoleORM.user_id))
            .filter(UserRoleORM.role_id == role_id)
            .scalar()
            or 0
        )


__all__ = ["SqlUserRepository", "SqlRoleRepository"]
