from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.entities import ViewDefinition


class IViewRepository(ABC):

    @abstractmethod
    def list_all(self) -> List[ViewDefinition]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[ViewDefinition]: ...

    @abstractmethod
    def save(self, view: ViewDefinition) -> None: ...

    @abstractmethod
    def delete(self, name: str) -> bool: ...
