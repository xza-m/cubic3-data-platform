"""
语义对象状态注册仓储实现
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.domain.entities.semantic_registry_entry import SemanticRegistryEntry
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)


class SemanticRegistryRepository(ISemanticRegistryRepository):
    def __init__(self, session: Session):
        self._session = session

    def get(self, object_type: str, object_name: str) -> Optional[SemanticRegistryEntry]:
        return (
            self._session.query(SemanticRegistryEntry)
            .filter_by(object_type=object_type, object_name=object_name)
            .first()
        )

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
        entry = self.get(object_type, object_name)
        if entry is None:
            entry = SemanticRegistryEntry(object_type=object_type, object_name=object_name)
            self._session.add(entry)

        if source_id is not None:
            entry.source_id = source_id
        if status is not None:
            entry.status = status
        if definition_hash is not None:
            entry.definition_hash = definition_hash
        if publish_status is not None:
            entry.publish_status = publish_status
        if last_published_at is not None:
            entry.last_published_at = self._normalize_datetime(last_published_at)
        if last_drift_status is not None:
            entry.last_drift_status = last_drift_status
        if last_drift_checked_at is not None:
            entry.last_drift_checked_at = self._normalize_datetime(last_drift_checked_at)
        if last_loaded_at is not None:
            entry.last_loaded_at = self._normalize_datetime(last_loaded_at)
        if measure_summary_snapshot is not None:
            entry.measure_summary_snapshot = measure_summary_snapshot
        if certified_measure_list is not None:
            entry.certified_measure_list = certified_measure_list
        if lineage_summary is not None:
            entry.lineage_summary = lineage_summary
        if source_binding_summary is not None:
            entry.source_binding_summary = source_binding_summary
        if domain_fingerprint is not None:
            entry.domain_fingerprint = domain_fingerprint

        self._session.flush()
        return entry

    def commit(self) -> None:
        self._session.commit()

    @staticmethod
    def _normalize_datetime(value):
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return value
