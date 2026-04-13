from __future__ import annotations

from app.domain.ontology.entities import OntologyHistoryEvent
from app.domain.ontology.ports.history_repository import IOntologyHistoryRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlOntologyHistoryRepository(IOntologyHistoryRepository):
    def __init__(self, history_dir: str):
        self._store = YamlEntityStore(history_dir, OntologyHistoryEvent, "id")

    def list_by_entity(self, entity_type: str, entity_name: str):
        items = [
            item
            for item in self._store.list_all()
            if item.entity_type == entity_type and item.entity_name == entity_name
        ]
        return sorted(items, key=lambda item: item.timestamp, reverse=True)

    def save(self, entity: OntologyHistoryEvent) -> None:
        self._store.save(entity)
