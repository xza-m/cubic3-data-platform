from __future__ import annotations

from app.domain.ontology.entities import GlossaryEntry
from app.domain.ontology.ports.glossary_repository import IGlossaryRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlGlossaryRepository(IGlossaryRepository):
    def __init__(self, glossary_dir: str):
        self._store = YamlEntityStore(glossary_dir, GlossaryEntry, "canonical_name")

    def list_all(self):
        return self._store.list_all()

    def get(self, canonical_name: str):
        return self._store.get(canonical_name)

    def save(self, entity: GlossaryEntry) -> None:
        self._store.save(entity)
