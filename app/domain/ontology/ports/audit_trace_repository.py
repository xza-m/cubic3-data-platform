from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import GovernanceAuditTrace


class IGovernanceAuditTraceRepository(ABC):
    @abstractmethod
    def get(self, trace_id: str) -> Optional[GovernanceAuditTrace]: ...

    @abstractmethod
    def list_all(self) -> List[GovernanceAuditTrace]: ...

    @abstractmethod
    def list_by_policy(self, policy_name: str) -> List[GovernanceAuditTrace]: ...

    @abstractmethod
    def list_filtered(
        self,
        *,
        policy_name: str | None = None,
        target_type: str | None = None,
        target_name: str | None = None,
        decision: str | None = None,
        route_type: str | None = None,
    ) -> List[GovernanceAuditTrace]: ...

    @abstractmethod
    def save(self, entity: GovernanceAuditTrace) -> None: ...
