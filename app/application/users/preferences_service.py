# app/application/users/preferences_service.py
"""
用户偏好应用服务（B-back-1）

职责：
- GET /api/v1/users/me/preferences → 返回偏好（未配置时返回默认值，不写库）
- PUT /api/v1/users/me/preferences → 字段 merge 更新
"""
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.entities.user_preferences import (
    DEFAULT_LANDING,
    DEFAULT_LIST_PAGE_SIZE,
    DEFAULT_TABLE_DENSITY,
    DEFAULT_THEME,
    VALID_TABLE_DENSITIES,
    VALID_THEMES,
    UserPreferences,
)
from app.infrastructure.repositories.user_preferences_repository import UserPreferencesRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

_SENTINEL = object()


class UpdatePreferencesRequest(BaseModel):
    """PUT /users/me/preferences 请求体校验（所有字段可选）。"""

    theme: Optional[str] = None
    default_landing: Optional[str] = None
    list_page_size: Optional[int] = Field(None, ge=5, le=200)
    table_density: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_THEMES:
            raise ValueError(f"theme 必须是 {VALID_THEMES} 之一，当前值: {v!r}")
        return v

    @field_validator("table_density")
    @classmethod
    def validate_table_density(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_TABLE_DENSITIES:
            raise ValueError(f"table_density 必须是 {VALID_TABLE_DENSITIES} 之一，当前值: {v!r}")
        return v

    @field_validator("default_landing")
    @classmethod
    def validate_default_landing(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith("/"):
            raise ValueError("default_landing 必须以 / 开头")
        return v


class UserPreferencesService:
    """用户偏好应用服务。"""

    def __init__(self, repository: UserPreferencesRepository) -> None:
        self.repository = repository

    def get_preferences(self, user_id: int) -> Dict[str, Any]:
        """
        获取用户偏好。

        - 数据库有记录 → 返回持久化值
        - 无记录       → 返回内存默认值字典（不写库，符合"不 404"要求）
        """
        prefs = self.repository.find_by_user_id(user_id)
        if prefs is None:
            logger.debug("user_preferences_not_found_returning_defaults", user_id=user_id)
            return {
                "user_id": user_id,
                "theme": DEFAULT_THEME,
                "default_landing": DEFAULT_LANDING,
                "list_page_size": DEFAULT_LIST_PAGE_SIZE,
                "table_density": DEFAULT_TABLE_DENSITY,
                "extra": {},
                "updated_at": None,
            }
        return prefs.to_dict()

    def update_preferences(
        self, user_id: int, payload: UpdatePreferencesRequest
    ) -> Dict[str, Any]:
        """
        部分字段 merge 更新。

        - 找到已有记录 → merge 指定字段
        - 未找到       → 以默认值为基础创建后 merge
        """
        prefs = self.repository.find_by_user_id(user_id)
        if prefs is None:
            prefs = UserPreferences(
                user_id=user_id,
                theme=DEFAULT_THEME,
                default_landing=DEFAULT_LANDING,
                list_page_size=DEFAULT_LIST_PAGE_SIZE,
                table_density=DEFAULT_TABLE_DENSITY,
                extra={},
            )

        prefs.merge_update(
            theme=payload.theme,
            default_landing=payload.default_landing,
            list_page_size=payload.list_page_size,
            table_density=payload.table_density,
            extra=payload.extra,
        )

        saved = self.repository.save(prefs)
        logger.info("user_preferences_updated", user_id=user_id)
        return saved.to_dict()
