"""
语义对象状态注册仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional

from app.domain.entities.semantic_registry_entry import SemanticRegistryEntry


class ISemanticRegistryRepository(ABC):
    @abstractmethod
    def get(self, object_type: str, object_name: str) -> Optional[SemanticRegistryEntry]:
        pass

    @abstractmethod
    def upsert(
        self,
        object_type: str,
        object_name: str,
        *,
        source_id: Optional[int] = None,
        status: Optional[str] = None,
        definition_hash: Optional[str] = None,
        publish_status: Optional[str] = None,
        last_published_at=None,
        last_drift_status: Optional[str] = None,
        last_drift_checked_at=None,
        last_loaded_at=None,
        measure_summary_snapshot=None,
        certified_measure_list=None,
        lineage_summary=None,
        source_binding_summary=None,
        domain_fingerprint: Optional[str] = None,
    ) -> SemanticRegistryEntry:
        pass

    @abstractmethod
    def commit(self) -> None:
        pass
