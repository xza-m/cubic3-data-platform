from __future__ import annotations

from app.domain.ontology.entities import BusinessObject
from app.domain.ontology.ports.object_repository import IBusinessObjectRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlBusinessObjectRepository(IBusinessObjectRepository):
    def __init__(self, objects_dir: str):
        self._store = YamlEntityStore(objects_dir, BusinessObject, "name")

    def list_all(self):
        return self._store.list_all()

    def get(self, name: str):
        return self._store.get(name)

    def save(self, entity: BusinessObject) -> None:
        self._store.save(entity)
