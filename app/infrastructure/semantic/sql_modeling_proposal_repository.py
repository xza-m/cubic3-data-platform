"""SQL 驱动的语义建模 Proposal 仓储。"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.domain.semantic.modeling_proposal import ModelingProposal
from app.domain.semantic.ports.modeling_proposal_repository import IModelingProposalRepository
from app.infrastructure.semantic.models import SemanticModelingProposalORM


class SqlModelingProposalRepository(IModelingProposalRepository):
    """生产用 Proposal 仓储，不依赖本地文件系统。"""

    def __init__(self, session: Session):
        self.session = session

    def get(self, proposal_id: str) -> Optional[ModelingProposal]:
        row = self._get_row(proposal_id)
        if row is None:
            return None
        return ModelingProposal(**(row.payload_json or {}))

    def save(self, proposal: ModelingProposal) -> None:
        proposal.touch()
        payload = proposal.model_dump(exclude_none=True)
        row = self._get_row(proposal.id)
        if row is None:
            row = SemanticModelingProposalORM(id=proposal.id)
            created_at = _parse_utc(proposal.created_at)
            if created_at is not None:
                row.created_at = created_at
            self.session.add(row)
        row.status = proposal.status
        row.payload_json = payload
        updated_at = _parse_utc(proposal.updated_at)
        if updated_at is not None:
            row.updated_at = updated_at
        row.version = int(row.version or 0) + 1
        self.session.commit()

    def _get_row(self, proposal_id: str) -> Optional[SemanticModelingProposalORM]:
        return (
            self.session.query(SemanticModelingProposalORM)
            .filter(SemanticModelingProposalORM.id == proposal_id)
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
