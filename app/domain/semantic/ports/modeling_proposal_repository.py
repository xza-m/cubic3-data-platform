"""建模助手 Proposal 仓储端口。"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from app.domain.semantic.modeling_proposal import ModelingProposal


class IModelingProposalRepository(ABC):
    @abstractmethod
    def get(self, proposal_id: str) -> Optional[ModelingProposal]:
        ...

    @abstractmethod
    def save(self, proposal: ModelingProposal) -> None:
        ...
