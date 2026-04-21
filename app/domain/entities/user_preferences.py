# app/domain/entities/user_preferences.py
"""
用户偏好领域实体（B-back-1）

对应 migration: migrations/versions/20260420_01_add_user_preferences.py
"""
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import BigInteger, Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow

VALID_THEMES = {"light", "dark", "system"}
VALID_TABLE_DENSITIES = {"comfortable", "compact"}

DEFAULT_THEME = "system"
DEFAULT_LANDING = "/dashboard"
DEFAULT_LIST_PAGE_SIZE = 20
DEFAULT_TABLE_DENSITY = "comfortable"
DEFAULT_EXTRA: Dict[str, Any] = {}


class UserPreferences(db.Model):
    """
    用户个性化偏好实体。

    - 以 user_id 为主键（一个用户只有一条记录）
    - GET 未配置时由 service 层返回内存默认值对象，不写库
    - PUT 执行字段级 merge（只更新请求中出现的字段）
    """

    __tablename__ = "user_preferences"
    __table_args__ = {"extend_existing": True}

    user_id = Column(BigInteger, primary_key=True)
    theme = Column(String(16), nullable=False, default=DEFAULT_THEME, server_default=DEFAULT_THEME)
    default_landing = Column(
        String(128), nullable=False, default=DEFAULT_LANDING, server_default=DEFAULT_LANDING
    )
    list_page_size = Column(
        Integer, nullable=False, default=DEFAULT_LIST_PAGE_SIZE, server_default=str(DEFAULT_LIST_PAGE_SIZE)
    )
    table_density = Column(
        String(16), nullable=False, default=DEFAULT_TABLE_DENSITY, server_default=DEFAULT_TABLE_DENSITY
    )
    extra = Column(JsonType, nullable=False, default=dict)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    # ------------------------------------------------------------------
    # 业务逻辑
    # ------------------------------------------------------------------

    def merge_update(
        self,
        theme: Optional[str] = None,
        default_landing: Optional[str] = None,
        list_page_size: Optional[int] = None,
        table_density: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        """只更新显式传入（非 None）的字段，其余保持不变。"""
        if theme is not None:
            self.theme = theme
        if default_landing is not None:
            self.default_landing = default_landing
        if list_page_size is not None:
            self.list_page_size = list_page_size
        if table_density is not None:
            self.table_density = table_density
        if extra is not None:
            self.extra = extra
        self.updated_at = utcnow()

    # ------------------------------------------------------------------
    # 序列化
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "theme": self.theme,
            "default_landing": self.default_landing,
            "list_page_size": self.list_page_size,
            "table_density": self.table_density,
            "extra": self.extra or {},
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<UserPreferences user_id={self.user_id} theme={self.theme}>"
