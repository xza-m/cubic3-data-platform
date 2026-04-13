from __future__ import annotations

from app.domain.ontology.entities import PolicyMetadata
from app.domain.ontology.ports.policy_repository import IPolicyMetadataRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlPolicyMetadataRepository(IPolicyMetadataRepository):
    def __init__(self, policies_dir: str):
        self._store = YamlEntityStore(policies_dir, PolicyMetadata, "name")

    def list_all(self):
        return self._store.list_all()

    def get(self, name: str):
        return self._store.get(name)

    def save(self, entity: PolicyMetadata) -> None:
        self._store.save(entity)
