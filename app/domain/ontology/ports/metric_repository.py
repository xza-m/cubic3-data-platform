from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.ontology.entities import BusinessMetric


class IBusinessMetricRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[BusinessMetric]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[BusinessMetric]: ...

    @abstractmethod
    def save(self, entity: BusinessMetric) -> None: ...
