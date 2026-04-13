from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from app.domain.ontology.entities import OntologyHistoryEvent


class IOntologyHistoryRepository(ABC):
    @abstractmethod
    def list_by_entity(self, entity_type: str, entity_name: str) -> List[OntologyHistoryEvent]: ...

    @abstractmethod
    def save(self, entity: OntologyHistoryEvent) -> None: ...
