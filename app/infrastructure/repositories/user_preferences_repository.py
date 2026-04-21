# app/infrastructure/repositories/user_preferences_repository.py
"""
用户偏好仓储实现（SQLAlchemy ORM，B-back-1）
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.domain.entities.user_preferences import UserPreferences


class UserPreferencesRepository:
    """用户偏好持久化仓储。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def find_by_user_id(self, user_id: int) -> Optional[UserPreferences]:
        """按 user_id 查询，找不到返回 None。"""
        return self.session.get(UserPreferences, user_id)

    def save(self, prefs: UserPreferences) -> UserPreferences:
        """创建或更新用户偏好（upsert 语义）。"""
        merged = self.session.merge(prefs)
        self.session.commit()
        self.session.refresh(merged)
        return merged
