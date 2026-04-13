from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import BusinessProperty


class IBusinessPropertyRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[BusinessProperty]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[BusinessProperty]: ...

    @abstractmethod
    def save(self, entity: BusinessProperty) -> None: ...
