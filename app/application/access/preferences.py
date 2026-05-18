"""Access Principal 偏好应用服务。"""
from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, field_validator

from app.infrastructure.access.models import PrincipalPreferencesORM
from app.infrastructure.access.preferences_repository import PrincipalPreferencesRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

VALID_THEMES = {"light", "dark", "system"}
VALID_TABLE_DENSITIES = {"comfortable", "compact"}

DEFAULT_THEME = "system"
DEFAULT_LANDING = "/dashboard"
DEFAULT_LIST_PAGE_SIZE = 20
DEFAULT_TABLE_DENSITY = "comfortable"


class UpdatePrincipalPreferencesRequest(BaseModel):
    """PUT /access/me/preferences 请求体校验。"""

    theme: Optional[str] = None
    default_landing: Optional[str] = None
    list_page_size: Optional[int] = Field(None, ge=5, le=200)
    table_density: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_THEMES:
            raise ValueError(f"theme 必须是 {VALID_THEMES} 之一，当前值: {value!r}")
        return value

    @field_validator("table_density")
    @classmethod
    def validate_table_density(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_TABLE_DENSITIES:
            raise ValueError(f"table_density 必须是 {VALID_TABLE_DENSITIES} 之一，当前值: {value!r}")
        return value

    @field_validator("default_landing")
    @classmethod
    def validate_default_landing(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.startswith("/"):
            raise ValueError("default_landing 必须以 / 开头")
        return value


class PrincipalPreferencesService:
    """Principal 个性化偏好服务。"""

    def __init__(self, repository: PrincipalPreferencesRepository) -> None:
        self.repository = repository

    def get_preferences(self, principal_id: str) -> dict[str, Any]:
        prefs = self.repository.find_by_principal_id(principal_id)
        if prefs is None:
            logger.debug(
                "principal_preferences_not_found_returning_defaults",
                principal_id=principal_id,
            )
            return {
                "principal_id": principal_id,
                "theme": DEFAULT_THEME,
                "default_landing": DEFAULT_LANDING,
                "list_page_size": DEFAULT_LIST_PAGE_SIZE,
                "table_density": DEFAULT_TABLE_DENSITY,
                "extra": {},
                "updated_at": None,
            }
        return _to_dict(prefs)

    def update_preferences(
        self,
        principal_id: str,
        payload: UpdatePrincipalPreferencesRequest,
    ) -> dict[str, Any]:
        prefs = self.repository.find_by_principal_id(principal_id)
        if prefs is None:
            prefs = PrincipalPreferencesORM(
                principal_id=principal_id,
                theme=DEFAULT_THEME,
                default_landing=DEFAULT_LANDING,
                list_page_size=DEFAULT_LIST_PAGE_SIZE,
                table_density=DEFAULT_TABLE_DENSITY,
                extra={},
            )

        if payload.theme is not None:
            prefs.theme = payload.theme
        if payload.default_landing is not None:
            prefs.default_landing = payload.default_landing
        if payload.list_page_size is not None:
            prefs.list_page_size = payload.list_page_size
        if payload.table_density is not None:
            prefs.table_density = payload.table_density
        if payload.extra is not None:
            prefs.extra = payload.extra

        saved = self.repository.save(prefs)
        logger.info("principal_preferences_updated", principal_id=principal_id)
        return _to_dict(saved)


def _to_dict(prefs: PrincipalPreferencesORM) -> dict[str, Any]:
    return {
        "principal_id": prefs.principal_id,
        "theme": prefs.theme,
        "default_landing": prefs.default_landing,
        "list_page_size": prefs.list_page_size,
        "table_density": prefs.table_density,
        "extra": prefs.extra or {},
        "updated_at": prefs.updated_at.isoformat() if prefs.updated_at else None,
    }
