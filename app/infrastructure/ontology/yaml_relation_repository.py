from __future__ import annotations

from app.domain.ontology.entities import BusinessRelation
from app.domain.ontology.ports.relation_repository import IBusinessRelationRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlBusinessRelationRepository(IBusinessRelationRepository):
    def __init__(self, relations_dir: str):
        self._store = YamlEntityStore(relations_dir, BusinessRelation, "name")

    def list_all(self):
        return self._store.list_all()

    def get(self, name: str):
        return self._store.get(name)

    def save(self, entity: BusinessRelation) -> None:
        self._store.save(entity)
