from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.entities import CatalogDefinition


class ICatalogRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[CatalogDefinition]: ...

    @abstractmethod
    def get(self, code: str) -> Optional[CatalogDefinition]: ...

    @abstractmethod
    def save(self, catalog: CatalogDefinition) -> None: ...

    @abstractmethod
    def delete(self, code: str) -> bool: ...

    @abstractmethod
    def reload(self) -> None: ...
