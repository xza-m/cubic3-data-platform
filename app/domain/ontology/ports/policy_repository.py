from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import PolicyMetadata


class IPolicyMetadataRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[PolicyMetadata]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[PolicyMetadata]: ...

    @abstractmethod
    def save(self, entity: PolicyMetadata) -> None: ...
