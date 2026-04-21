# tests/unit/application/users/test_user_service.py
"""
W4.D-2 · UserService 单元测试

使用内存 fake repository（不依赖 Flask / DB），覆盖：
    - list / get / create / update / delete / assign_roles / authenticate
    - 各种校验失败分支
"""
from __future__ import annotations

from typing import Optional

import pytest

from app.application.users.errors import (
    CannotDeleteSelfError,
    DuplicateUserError,
    RoleNotFoundError,
    UserNotFoundError,
    UserValidationError,
)
from app.application.users.user_service import UserService
from app.domain.users.repositories import (
    RoleRepository,
    UserListFilters,
    UserListResult,
    UserRepository,
)
from app.domain.users.role import Role
from app.domain.users.user import User


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeHasher:
    def hash(self, plain: str) -> str:
        return f"hashed::{plain}"

    def verify(self, plain: str, hashed: str) -> bool:
        return hashed == f"hashed::{plain}"


class FakeUserRepo(UserRepository):
    def __init__(self) -> None:
        self.users: dict[int, User] = {}
        self.passwords: dict[int, str] = {}
        self.roles_by_user: dict[int, list[str]] = {}
        self._role_provider: Optional[RoleRepository] = None
        self._next_id = 1
        self.last_login_calls = 0

    def link_roles(self, role_repo: "FakeRoleRepo") -> None:
        self._role_provider = role_repo

    def list(self, filters: UserListFilters) -> UserListResult:
        items = list(self.users.values())
        if filters.q:
            qq = filters.q.lower()
            items = [u for u in items if qq in u.username.lower() or qq in (u.display_name or "").lower()]
        if filters.status:
            items = [u for u in items if u.status == filters.status]
        total = len(items)
        start = (filters.page - 1) * filters.size
        page_items = items[start : start + filters.size]
        return UserListResult(
            items=page_items,
            total=total,
            page=filters.page,
            size=filters.size,
            role_ids_by_user={u.id: [] for u in page_items},
        )

    def get(self, user_id: int) -> Optional[User]:
        return self.users.get(user_id)

    def get_by_username(self, username: str) -> Optional[User]:
        return next((u for u in self.users.values() if u.username == username), None)

    def get_password_hash(self, user_id: int) -> Optional[str]:
        return self.passwords.get(user_id)

    def get_role_ids(self, user_id: int) -> list[int]:
        codes = self.roles_by_user.get(user_id, [])
        if not self._role_provider:
            return []
        return [r.id for c in codes for r in [self._role_provider.get_by_code(c)] if r and r.id]

    def get_roles(self, user_id: int) -> list[Role]:
        codes = self.roles_by_user.get(user_id, [])
        if not self._role_provider:
            return []
        return [r for c in codes for r in [self._role_provider.get_by_code(c)] if r]

    def count(self) -> int:
        return len(self.users)

    def create(self, entity: User, password_hash: Optional[str] = None) -> User:
        entity.id = self._next_id
        self._next_id += 1
        self.users[entity.id] = entity
        if password_hash:
            self.passwords[entity.id] = password_hash
        return entity

    def update(self, user_id: int, patch: dict) -> Optional[User]:
        user = self.users.get(user_id)
        if not user:
            return None
        for k, v in patch.items():
            setattr(user, k, v)
        return user

    def update_password(self, user_id: int, password_hash: str) -> None:
        self.passwords[user_id] = password_hash

    def update_last_login(self, user_id: int) -> None:
        self.last_login_calls += 1

    def delete(self, user_id: int) -> bool:
        return self.users.pop(user_id, None) is not None

    def assign_roles(self, user_id: int, role_codes: list[str]) -> list[Role]:
        self.roles_by_user[user_id] = list(role_codes)
        return self.get_roles(user_id)


class FakeRoleRepo(RoleRepository):
    def __init__(self) -> None:
        self.roles: dict[int, Role] = {}
        self._next_id = 1
        self.user_count_by_role: dict[int, int] = {}

    def list(self, q: Optional[str] = None) -> list[Role]:
        items = list(self.roles.values())
        if q:
            qq = q.lower()
            items = [r for r in items if qq in r.code.lower() or qq in r.name.lower()]
        return items

    def get(self, role_id: int) -> Optional[Role]:
        return self.roles.get(role_id)

    def get_by_code(self, code: str) -> Optional[Role]:
        return next((r for r in self.roles.values() if r.code == code), None)

    def get_many_by_codes(self, codes: list[str]) -> list[Role]:
        return [r for r in self.roles.values() if r.code in codes]

    def create(self, entity: Role) -> Role:
        entity.id = self._next_id
        self._next_id += 1
        self.roles[entity.id] = entity
        return entity

    def update(self, role_id: int, patch: dict) -> Optional[Role]:
        role = self.roles.get(role_id)
        if not role:
            return None
        for k, v in patch.items():
            setattr(role, k, v)
        return role

    def delete(self, role_id: int) -> bool:
        return self.roles.pop(role_id, None) is not None

    def count_users(self, role_id: int) -> int:
        return self.user_count_by_role.get(role_id, 0)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def role_repo():
    repo = FakeRoleRepo()
    repo.create(Role(code="admin", name="Admin", is_system=True))
    repo.create(Role(code="viewer", name="Viewer", is_system=True))
    return repo


@pytest.fixture
def user_repo(role_repo):
    repo = FakeUserRepo()
    repo.link_roles(role_repo)
    return repo


@pytest.fixture
def service(user_repo, role_repo):
    return UserService(user_repo, role_repo, FakeHasher())


# ---------------------------------------------------------------------------
# create_user
# ---------------------------------------------------------------------------


class TestCreateUser:
    def test_create_minimal(self, service, user_repo):
        result = service.create_user({"username": "alice", "password": "secret123"})
        assert result["username"] == "alice"
        assert result["is_active"] is True
        assert user_repo.passwords[result["id"]] == "hashed::secret123"

    def test_create_normalizes_username_lowercase(self, service):
        result = service.create_user({"username": "  Bob  ", "password": "secret123"})
        assert result["username"] == "bob"

    def test_create_with_role_codes(self, service):
        result = service.create_user(
            {"username": "carol", "password": "secret123", "role_codes": ["admin"]}
        )
        assert "admin" in result["role_codes"]

    def test_create_with_role_ids(self, service, role_repo):
        admin = role_repo.get_by_code("admin")
        result = service.create_user(
            {"username": "dave", "password": "secret123", "role_ids": [admin.id]}
        )
        assert admin.id in result["role_ids"]

    def test_create_disabled(self, service):
        result = service.create_user(
            {"username": "ed", "password": "secret123", "is_active": False}
        )
        assert result["is_active"] is False

    def test_duplicate_username_raises(self, service):
        service.create_user({"username": "frank", "password": "secret123"})
        with pytest.raises(DuplicateUserError):
            service.create_user({"username": "frank", "password": "secret123"})

    def test_invalid_username_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_user({"username": "1bad", "password": "secret123"})

    def test_short_password_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_user({"username": "geo", "password": "x"})

    def test_unknown_role_raises(self, service):
        with pytest.raises(RoleNotFoundError):
            service.create_user(
                {"username": "harry", "password": "secret123", "role_ids": [99999]}
            )

    def test_invalid_status_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_user(
                {"username": "ivy", "password": "secret123", "status": "xx"}
            )


# ---------------------------------------------------------------------------
# update_user
# ---------------------------------------------------------------------------


class TestUpdateUser:
    def test_update_display_name(self, service):
        u = service.create_user({"username": "kate", "password": "secret123"})
        result = service.update_user(u["id"], {"display_name": "Kate Q"})
        assert result["display_name"] == "Kate Q"

    def test_is_active_false_disables(self, service):
        u = service.create_user({"username": "leo", "password": "secret123"})
        result = service.update_user(u["id"], {"is_active": False})
        assert result["is_active"] is False
        assert result["status"] == "disabled"

    def test_password_update_rehashes(self, service, user_repo):
        u = service.create_user({"username": "mona", "password": "secret123"})
        service.update_user(u["id"], {"password": "newone"})
        assert user_repo.passwords[u["id"]] == "hashed::newone"

    def test_password_too_short_raises(self, service):
        u = service.create_user({"username": "noah", "password": "secret123"})
        with pytest.raises(UserValidationError):
            service.update_user(u["id"], {"password": "x"})

    def test_invalid_status_raises(self, service):
        u = service.create_user({"username": "olive", "password": "secret123"})
        with pytest.raises(UserValidationError):
            service.update_user(u["id"], {"status": "garbage"})

    def test_missing_user_raises(self, service):
        with pytest.raises(UserNotFoundError):
            service.update_user(9999, {"display_name": "x"})


# ---------------------------------------------------------------------------
# delete_user
# ---------------------------------------------------------------------------


class TestDeleteUser:
    def test_delete_normal_user(self, service):
        u = service.create_user({"username": "pat", "password": "secret123"})
        service.delete_user(u["id"])
        with pytest.raises(UserNotFoundError):
            service.get_user(u["id"])

    def test_delete_self_raises(self, service):
        u = service.create_user({"username": "quinn", "password": "secret123"})
        with pytest.raises(CannotDeleteSelfError):
            service.delete_user(u["id"], current_user_id=u["id"])

    def test_delete_system_user_soft_deletes(self, service, user_repo):
        u = service.create_user({"username": "root", "password": "secret123"})
        # 标记为 system
        user_repo.users[u["id"]].is_system = True
        service.delete_user(u["id"])
        # 仍存在
        assert user_repo.get(u["id"]) is not None
        assert user_repo.get(u["id"]).status == "disabled"

    def test_delete_missing_raises(self, service):
        with pytest.raises(UserNotFoundError):
            service.delete_user(9999)


# ---------------------------------------------------------------------------
# assign_roles
# ---------------------------------------------------------------------------


class TestAssignRoles:
    def test_replace_role_set(self, service, user_repo):
        u = service.create_user(
            {"username": "rex", "password": "secret123", "role_codes": ["admin"]}
        )
        service.assign_roles(u["id"], ["viewer"])
        assert user_repo.roles_by_user[u["id"]] == ["viewer"]

    def test_dedupes(self, service, user_repo):
        u = service.create_user({"username": "sam", "password": "secret123"})
        service.assign_roles(u["id"], ["admin", "admin", "viewer"])
        assert user_repo.roles_by_user[u["id"]] == ["admin", "viewer"]

    def test_unknown_role_raises(self, service):
        u = service.create_user({"username": "tom", "password": "secret123"})
        with pytest.raises(RoleNotFoundError):
            service.assign_roles(u["id"], ["nope"])

    def test_non_list_raises(self, service):
        u = service.create_user({"username": "uma", "password": "secret123"})
        with pytest.raises(UserValidationError):
            service.assign_roles(u["id"], "admin")  # type: ignore[arg-type]

    def test_empty_clears(self, service, user_repo):
        u = service.create_user(
            {"username": "vic", "password": "secret123", "role_codes": ["admin"]}
        )
        service.assign_roles(u["id"], [])
        assert user_repo.roles_by_user[u["id"]] == []


# ---------------------------------------------------------------------------
# authenticate
# ---------------------------------------------------------------------------


class TestAuthenticate:
    def test_correct_credentials_returns_user(self, service, user_repo):
        service.create_user({"username": "wilma", "password": "secret123"})
        result = service.authenticate("wilma", "secret123")
        assert result is not None
        assert result["username"] == "wilma"
        assert user_repo.last_login_calls == 1

    def test_wrong_password_returns_none(self, service):
        service.create_user({"username": "xena", "password": "secret123"})
        assert service.authenticate("xena", "wrong") is None

    def test_unknown_user_returns_none(self, service):
        assert service.authenticate("ghost", "secret123") is None

    def test_disabled_user_returns_none(self, service):
        service.create_user(
            {"username": "yara", "password": "secret123", "is_active": False}
        )
        assert service.authenticate("yara", "secret123") is None

    def test_empty_inputs_return_none(self, service):
        assert service.authenticate("", "") is None
        assert service.authenticate("x", "") is None


# ---------------------------------------------------------------------------
# list_users / has_any_user
# ---------------------------------------------------------------------------


class TestList:
    def test_pagination_caps_size(self, service):
        result = service.list_users(page=1, size=9999)
        assert result["size"] == 200

    def test_invalid_status_raises(self, service):
        with pytest.raises(UserValidationError):
            service.list_users(status="bogus")

    def test_status_all_returns_everything(self, service):
        service.create_user({"username": "z1", "password": "secret123"})
        service.create_user(
            {"username": "z2", "password": "secret123", "is_active": False}
        )
        result = service.list_users(status="all")
        usernames = [i["username"] for i in result["items"]]
        assert {"z1", "z2"} <= set(usernames)

    def test_search_q(self, service):
        service.create_user({"username": "find_me", "password": "secret123"})
        service.create_user({"username": "other", "password": "secret123"})
        result = service.list_users(q="find")
        assert any(i["username"] == "find_me" for i in result["items"])

    def test_has_any_user(self, service):
        assert service.has_any_user() is False
        service.create_user({"username": "first", "password": "secret123"})
        assert service.has_any_user() is True


# ---------------------------------------------------------------------------
# get_user
# ---------------------------------------------------------------------------


class TestGet:
    def test_get_existing(self, service):
        u = service.create_user({"username": "abel", "password": "secret123"})
        result = service.get_user(u["id"])
        assert result["id"] == u["id"]

    def test_get_missing_raises(self, service):
        with pytest.raises(UserNotFoundError):
            service.get_user(99999)
