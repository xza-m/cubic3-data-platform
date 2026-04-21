# tests/unit/application/users/test_role_service.py
"""
W4.D-2 · RoleService 单元测试

使用内存 fake repository，覆盖：
    - list / get / create / update / delete
    - 自动 slug、权限校验、系统角色保护、in-use 校验
"""
from __future__ import annotations

from typing import Optional

import pytest

from app.application.users.errors import (
    DuplicateRoleError,
    RoleInUseError,
    RoleNotFoundError,
    SystemEntityProtectedError,
    UserValidationError,
)
from app.application.users.role_service import RoleService, _slugify_to_code
from app.domain.users.repositories import RoleRepository
from app.domain.users.role import Role


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


@pytest.fixture
def role_repo():
    return FakeRoleRepo()


@pytest.fixture
def service(role_repo):
    return RoleService(role_repo)


# ---------------------------------------------------------------------------
# create_role
# ---------------------------------------------------------------------------


class TestCreateRole:
    def test_explicit_code(self, service):
        result = service.create_role({"code": "qa", "name": "QA"})
        assert result["code"] == "qa"

    def test_auto_slug_from_name(self, service):
        result = service.create_role({"name": "Auto Generated Role"})
        assert result["code"] == "auto_generated_role"

    def test_auto_slug_with_special_chars(self, service):
        result = service.create_role({"name": "中文角色 99 / Test"})
        assert result["code"]

    def test_blank_name_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_role({"name": "  "})

    def test_invalid_code_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_role({"code": "9bad", "name": "Bad"})

    def test_unknown_permission_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_role(
                {"code": "x", "name": "X", "permissions": ["not:real"]}
            )

    def test_known_permissions_pass(self, service):
        result = service.create_role(
            {
                "code": "rd",
                "name": "Reader",
                "permissions": ["datasource:read"],
            }
        )
        assert "datasource:read" in result["permissions"]

    def test_duplicate_code_raises(self, service):
        service.create_role({"code": "dup", "name": "Dup"})
        with pytest.raises(DuplicateRoleError):
            service.create_role({"code": "dup", "name": "Dup"})

    def test_permissions_not_list_raises(self, service):
        with pytest.raises(UserValidationError):
            service.create_role(
                {"code": "role_xp", "name": "X", "permissions": "datasource:read"}
            )


# ---------------------------------------------------------------------------
# update_role
# ---------------------------------------------------------------------------


class TestUpdateRole:
    def test_update_name(self, service):
        r = service.create_role({"code": "u1", "name": "U1"})
        result = service.update_role(r["id"], {"name": "U1 New"})
        assert result["name"] == "U1 New"

    def test_update_permissions(self, service):
        r = service.create_role({"code": "u2", "name": "U2"})
        result = service.update_role(
            r["id"], {"permissions": ["datasource:read", "datasource:write"]}
        )
        assert "datasource:read" in result["permissions"]

    def test_update_blank_name_raises(self, service):
        r = service.create_role({"code": "u3", "name": "U3"})
        with pytest.raises(UserValidationError):
            service.update_role(r["id"], {"name": "  "})

    def test_change_code_unique_check(self, service):
        a = service.create_role({"code": "code_a", "name": "A"})
        service.create_role({"code": "code_b", "name": "B"})
        with pytest.raises(DuplicateRoleError):
            service.update_role(a["id"], {"code": "code_b"})

    def test_change_code_invalid_raises(self, service):
        r = service.create_role({"code": "code_c", "name": "C"})
        with pytest.raises(UserValidationError):
            service.update_role(r["id"], {"code": "9bad"})

    def test_system_role_blocks_code_change(self, service, role_repo):
        r = service.create_role({"code": "sys", "name": "Sys"})
        role_repo.roles[r["id"]].is_system = True
        with pytest.raises(SystemEntityProtectedError):
            service.update_role(r["id"], {"code": "new_code"})

    def test_system_role_blocks_permissions_change(self, service, role_repo):
        r = service.create_role({"code": "sys2", "name": "Sys2"})
        role_repo.roles[r["id"]].is_system = True
        with pytest.raises(SystemEntityProtectedError):
            service.update_role(r["id"], {"permissions": ["datasource:read"]})

    def test_system_role_can_rename(self, service, role_repo):
        r = service.create_role({"code": "sys3", "name": "Sys3"})
        role_repo.roles[r["id"]].is_system = True
        result = service.update_role(r["id"], {"name": "Sys3 renamed"})
        assert result["name"] == "Sys3 renamed"

    def test_missing_role_raises(self, service):
        with pytest.raises(RoleNotFoundError):
            service.update_role(9999, {"name": "x"})

    def test_no_changes_returns_current(self, service):
        r = service.create_role({"code": "noop", "name": "NoOp"})
        result = service.update_role(r["id"], {})
        assert result["id"] == r["id"]


# ---------------------------------------------------------------------------
# delete_role
# ---------------------------------------------------------------------------


class TestDeleteRole:
    def test_delete_unused(self, service):
        r = service.create_role({"code": "del", "name": "Del"})
        service.delete_role(r["id"])
        assert service.role_repo.get(r["id"]) is None

    def test_delete_in_use_raises(self, service, role_repo):
        r = service.create_role({"code": "inuse", "name": "InUse"})
        role_repo.user_count_by_role[r["id"]] = 3
        with pytest.raises(RoleInUseError):
            service.delete_role(r["id"])

    def test_delete_system_raises(self, service, role_repo):
        r = service.create_role({"code": "sysd", "name": "SysD"})
        role_repo.roles[r["id"]].is_system = True
        with pytest.raises(SystemEntityProtectedError):
            service.delete_role(r["id"])

    def test_delete_missing_raises(self, service):
        with pytest.raises(RoleNotFoundError):
            service.delete_role(9999)


# ---------------------------------------------------------------------------
# list / get / count_users
# ---------------------------------------------------------------------------


class TestList:
    def test_list_all(self, service):
        service.create_role({"code": "role_a", "name": "A"})
        service.create_role({"code": "role_b", "name": "B"})
        result = service.list_roles()
        assert len(result) == 2

    def test_search_q(self, service):
        service.create_role({"code": "match", "name": "Match"})
        service.create_role({"code": "other", "name": "Other"})
        result = service.list_roles(q="match")
        codes = [r["code"] for r in result]
        assert codes == ["match"]


class TestGet:
    def test_get_existing(self, service):
        r = service.create_role({"code": "role_g", "name": "G"})
        assert service.get_role(r["id"])["id"] == r["id"]

    def test_get_missing_raises(self, service):
        with pytest.raises(RoleNotFoundError):
            service.get_role(99999)


class TestCountUsers:
    def test_count_users(self, service, role_repo):
        r = service.create_role({"code": "cnt", "name": "Cnt"})
        role_repo.user_count_by_role[r["id"]] = 5
        assert service.count_users_in_role(r["id"]) == 5

    def test_count_missing_raises(self, service):
        with pytest.raises(RoleNotFoundError):
            service.count_users_in_role(9999)


# ---------------------------------------------------------------------------
# _slugify_to_code helper
# ---------------------------------------------------------------------------


class TestSlugify:
    @pytest.mark.parametrize(
        "input_,expected",
        [
            ("Admin User", "admin_user"),
            ("ROLE-1", "role_1"),
            ("  spaces  ", "spaces"),
            ("数据-Owner", "owner"),  # 中文被去掉，前缀以数字开头会再补 r_
            ("99 Bad", "r_99_bad"),
        ],
    )
    def test_various(self, input_, expected):
        assert _slugify_to_code(input_) == expected

    def test_empty_returns_empty(self):
        assert _slugify_to_code("   ") == ""
