from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import BusinessRelation


class IBusinessRelationRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[BusinessRelation]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[BusinessRelation]: ...

    @abstractmethod
    def save(self, entity: BusinessRelation) -> None: ...
