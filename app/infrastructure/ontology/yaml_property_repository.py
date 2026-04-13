from __future__ import annotations

from app.domain.ontology.entities import BusinessProperty
from app.domain.ontology.ports.property_repository import IBusinessPropertyRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlBusinessPropertyRepository(IBusinessPropertyRepository):
    def __init__(self, properties_dir: str):
        self._store = YamlEntityStore(properties_dir, BusinessProperty, "name")

    def list_all(self):
        return self._store.list_all()

    def get(self, name: str):
        return self._store.get(name)

    def save(self, entity: BusinessProperty) -> None:
        self._store.save(entity)
