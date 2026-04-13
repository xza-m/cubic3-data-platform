from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import BusinessObject


class IBusinessObjectRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[BusinessObject]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[BusinessObject]: ...

    @abstractmethod
    def save(self, entity: BusinessObject) -> None: ...
