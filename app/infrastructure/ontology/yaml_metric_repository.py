from __future__ import annotations

from app.domain.ontology.entities import BusinessMetric
from app.domain.ontology.ports.metric_repository import IBusinessMetricRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlBusinessMetricRepository(IBusinessMetricRepository):
    def __init__(self, metrics_dir: str):
        self._store = YamlEntityStore(metrics_dir, BusinessMetric, "name")

    def list_all(self):
        return self._store.list_all()

    def get(self, name: str):
        return self._store.get(name)

    def save(self, entity: BusinessMetric) -> None:
        self._store.save(entity)
