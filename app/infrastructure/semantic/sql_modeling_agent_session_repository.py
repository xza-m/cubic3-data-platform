"""SQL 驱动的语义建模 Copilot 会话仓储。"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.domain.semantic.modeling_agent_session import AgentSession
from app.domain.semantic.ports.modeling_agent_session_repository import (
    IModelingAgentSessionRepository,
)
from app.infrastructure.semantic.models import SemanticModelingAgentSessionORM


class SqlModelingAgentSessionRepository(IModelingAgentSessionRepository):
    """生产用会话仓储，不使用进程内 cache。"""

    def __init__(self, session: Session):
        self.session = session

    def get(self, session_id: str) -> Optional[AgentSession]:
        row = self._get_row(session_id)
        if row is None:
            return None
        return AgentSession(**(row.payload_json or {}))

    def save(self, session: AgentSession) -> None:
        session.touch()
        payload = session.model_dump(exclude_none=True)
        row = self._get_row(session.id)
        if row is None:
            row = SemanticModelingAgentSessionORM(id=session.id)
            created_at = _parse_utc(session.created_at)
            if created_at is not None:
                row.created_at = created_at
            self.session.add(row)
        row.principal_id = session.principal_id
        row.status = session.status
        row.title = session.title
        row.payload_json = payload
        updated_at = _parse_utc(session.updated_at)
        if updated_at is not None:
            row.updated_at = updated_at
        row.version = int(row.version or 0) + 1
        self.session.commit()

    def list(
        self,
        principal_id: Optional[str] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        include_legacy: bool = True,
    ) -> List[AgentSession]:
        query = self.session.query(SemanticModelingAgentSessionORM)
        if principal_id is not None:
            if include_legacy:
                query = query.filter(
                    (SemanticModelingAgentSessionORM.principal_id == principal_id)
                    | (SemanticModelingAgentSessionORM.principal_id.is_(None))
                )
            else:
                query = query.filter(SemanticModelingAgentSessionORM.principal_id == principal_id)
        if status is not None:
            query = query.filter(SemanticModelingAgentSessionORM.status == status)
        query = query.order_by(SemanticModelingAgentSessionORM.updated_at.desc())
        if offset:
            query = query.offset(offset)
        if limit is not None and limit >= 0:
            query = query.limit(limit)
        return [AgentSession(**(row.payload_json or {})) for row in query.all()]

    def delete(self, session_id: str) -> None:
        row = self._get_row(session_id)
        if row is None:
            return
        self.session.delete(row)
        self.session.commit()

    def update_metadata(
        self,
        session_id: str,
        *,
        title: Optional[str] = None,
    ) -> Optional[AgentSession]:
        session = self.get(session_id)
        if session is None:
            return None
        if title is not None:
            session.title = title.strip() or None
        self.save(session)
        return session

    def _get_row(self, session_id: str) -> Optional[SemanticModelingAgentSessionORM]:
        return (
            self.session.query(SemanticModelingAgentSessionORM)
            .filter(SemanticModelingAgentSessionORM.id == session_id)
            .first()
        )


def _parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None
