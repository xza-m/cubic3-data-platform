# app/application/users/errors.py
"""
用户域应用层异常（W4.D-2）

继承自 ``app.shared.exceptions``，确保全局错误处理器能映射到正确的 HTTP 状态码：

    - ``UserNotFoundError`` / ``RoleNotFoundError`` → 404
    - ``UserValidationError`` → 400
    - ``RoleInUseError`` / ``DuplicateUserError`` / ``DuplicateRoleError`` →
      400（业务规则违反，errors 中携带 ``status_code=409`` 给端点选择 409 回应）
"""
from __future__ import annotations

from app.shared.exceptions import (
    BusinessRuleViolationError,
    EntityNotFoundError,
    ValidationError,
)


class UserNotFoundError(EntityNotFoundError):
    def __init__(self, user_id: int):
        super().__init__(
            message=f"用户 {user_id} 不存在",
            code="USER_NOT_FOUND",
            details={"user_id": user_id},
        )


class RoleNotFoundError(EntityNotFoundError):
    def __init__(self, identifier):
        key = "role_id" if isinstance(identifier, int) else "role_code"
        super().__init__(
            message=f"角色 {identifier} 不存在",
            code="ROLE_NOT_FOUND",
            details={key: identifier},
        )


class UserValidationError(ValidationError):
    """用户域字段校验失败（参数错误，对应 400）。"""

    def __init__(self, message: str, field: str | None = None):
        details = {"field": field} if field else {}
        super().__init__(message=message, code="USER_VALIDATION_ERROR", details=details)


class DuplicateUserError(BusinessRuleViolationError):
    """用户名重复（对应 409）。"""

    def __init__(self, username: str):
        super().__init__(
            message=f"用户名 {username!r} 已被占用",
            code="DUPLICATE_USERNAME",
            details={"username": username, "status_code": 409},
        )


class DuplicateRoleError(BusinessRuleViolationError):
    """角色 code 重复（对应 409）。"""

    def __init__(self, code: str):
        super().__init__(
            message=f"角色 code {code!r} 已存在",
            code="DUPLICATE_ROLE_CODE",
            details={"code": code, "status_code": 409},
        )


class RoleInUseError(BusinessRuleViolationError):
    """角色已被绑定，禁止删除（对应 400）。"""

    def __init__(self, role_id: int, user_count: int):
        super().__init__(
            message=f"角色 {role_id} 已被 {user_count} 个用户使用，无法删除",
            code="ROLE_IN_USE",
            details={"role_id": role_id, "user_count": user_count},
        )


class SystemEntityProtectedError(BusinessRuleViolationError):
    """禁止删除/修改系统内置实体。"""

    def __init__(self, what: str):
        super().__init__(
            message=f"系统内置 {what} 不允许此操作",
            code="SYSTEM_ENTITY_PROTECTED",
            details={"target": what},
        )


class CannotDeleteSelfError(BusinessRuleViolationError):
    def __init__(self, user_id: int):
        super().__init__(
            message="不能删除自己的账号",
            code="CANNOT_DELETE_SELF",
            details={"user_id": user_id},
        )
