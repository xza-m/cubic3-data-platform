from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.entities import DomainDefinition


class IDomainRepository(ABC):
    @abstractmethod
    def list_all(self) -> List[DomainDefinition]: ...

    @abstractmethod
    def get(self, domain_id: str) -> Optional[DomainDefinition]: ...

    @abstractmethod
    def get_by_code(self, code: str) -> Optional[DomainDefinition]: ...

    @abstractmethod
    def save(self, domain: DomainDefinition) -> None: ...

    @abstractmethod
    def delete(self, domain_id: str) -> bool: ...

    @abstractmethod
    def reload(self) -> None: ...
