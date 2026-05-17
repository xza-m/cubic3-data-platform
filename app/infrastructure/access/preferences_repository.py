"""Access Principal 偏好仓储。"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.infrastructure.access.models import PrincipalPreferencesORM


class PrincipalPreferencesRepository:
    """Principal 个性化偏好持久化仓储。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def find_by_principal_id(self, principal_id: str) -> PrincipalPreferencesORM | None:
        return self.session.get(PrincipalPreferencesORM, principal_id)

    def save(self, prefs: PrincipalPreferencesORM) -> PrincipalPreferencesORM:
        merged = self.session.merge(prefs)
        self.session.commit()
        self.session.refresh(merged)
        return merged
