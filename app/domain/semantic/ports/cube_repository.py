from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.entities import CubeDefinition


class ICubeRepository(ABC):

    @abstractmethod
    def list_all(self) -> List[CubeDefinition]: ...

    @abstractmethod
    def get(self, name: str) -> Optional[CubeDefinition]: ...

    @abstractmethod
    def save(self, cube: CubeDefinition) -> None: ...

    @abstractmethod
    def delete(self, name: str) -> bool: ...
