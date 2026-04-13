from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import GlossaryEntry


class IGlossaryRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[GlossaryEntry]: ...

    @abstractmethod
    def get(self, canonical_name: str) -> Optional[GlossaryEntry]: ...

    @abstractmethod
    def save(self, entity: GlossaryEntry) -> None: ...
