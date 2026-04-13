from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import BusinessAction


class IBusinessActionRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[BusinessAction]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[BusinessAction]: ...

    @abstractmethod
    def save(self, entity: BusinessAction) -> None: ...
