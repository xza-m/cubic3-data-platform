from __future__ import annotations

from app.domain.ontology.entities import BusinessAction
from app.domain.ontology.ports.action_repository import IBusinessActionRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlBusinessActionRepository(IBusinessActionRepository):
    def __init__(self, actions_dir: str):
        self._store = YamlEntityStore(actions_dir, BusinessAction, "name")

    def list_all(self):
        return self._store.list_all()

    def get(self, name: str):
        return self._store.get(name)

    def save(self, entity: BusinessAction) -> None:
        self._store.save(entity)
