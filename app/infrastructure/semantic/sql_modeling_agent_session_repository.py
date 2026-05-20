"""SQL 驱动的语义建模 Copilot 会话仓储。"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.domain.semantic.copilot_state import CopilotStateConflict
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
        return AgentSession(**self._payload_from_row(row))

    def save(
        self,
        session: AgentSession,
        *,
        expected_state_version: Optional[int] = None,
    ) -> None:
        session.touch()
        payload = session.model_dump(exclude_none=True)
        updated_at = _parse_utc(session.updated_at)
        row_values = {
            "principal_id": session.principal_id,
            "status": session.status,
            "state": session.state,
            "state_version": session.state_version,
            "title": session.title,
            "payload_json": payload,
        }
        if updated_at is not None:
            row_values["updated_at"] = updated_at
        row = self._get_row(session.id)
        if row is None:
            if expected_state_version is not None and expected_state_version != 0:
                raise CopilotStateConflict(
                    f"expected state_version={expected_state_version}, actual=None"
                )
            row = SemanticModelingAgentSessionORM(id=session.id)
            created_at = _parse_utc(session.created_at)
            if created_at is not None:
                row.created_at = created_at
            self.session.add(row)
        elif expected_state_version is not None:
            stmt = (
                update(SemanticModelingAgentSessionORM)
                .where(SemanticModelingAgentSessionORM.id == session.id)
                .where(
                    SemanticModelingAgentSessionORM.state_version == expected_state_version
                )
                .values(**row_values, version=SemanticModelingAgentSessionORM.version + 1)
            )
            result = self.session.execute(stmt)
            if result.rowcount != 1:
                actual_row = self._get_row(session.id)
                actual = self._state_version_from_row(actual_row) if actual_row else None
                self.session.rollback()
                raise CopilotStateConflict(
                    f"expected state_version={expected_state_version}, actual={actual}"
                )
            self.session.commit()
            return
        for key, value in row_values.items():
            setattr(row, key, value)
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
        return [AgentSession(**self._payload_from_row(row)) for row in query.all()]

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

    def _payload_from_row(self, row: SemanticModelingAgentSessionORM) -> dict:
        payload = dict(row.payload_json or {})
        payload.setdefault("state", row.state or "created")
        payload.setdefault("state_version", row.state_version or 1)
        payload.setdefault("state_history", [])
        payload.setdefault("event_log", [])
        return payload

    def _state_version_from_row(self, row: SemanticModelingAgentSessionORM) -> int:
        payload = row.payload_json or {}
        return int(row.state_version or payload.get("state_version") or 1)


def _parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None
