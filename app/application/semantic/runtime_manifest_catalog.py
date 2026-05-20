"""Runtime manifest 到只读语义 Catalog 的适配。"""
from __future__ import annotations

from typing import Any, Generic, Iterable, TypeVar

from pydantic import BaseModel, ValidationError

from app.domain.ontology.entities import (
    BusinessAction,
    BusinessMetric,
    BusinessObject,
    BusinessRelation,
    GlossaryEntry,
)
from app.domain.semantic.entities import CubeDefinition

T = TypeVar("T", bound=BaseModel)


class RuntimeRepository(Generic[T]):
    """运行时只读仓储，适配现有 preview/compile 服务的最小接口。"""

    def __init__(self, entities: Iterable[T], *, key_attr: str = "name"):
        self._entities = {str(getattr(entity, key_attr)): entity for entity in entities}

    def get(self, name: str) -> T | None:
        return self._entities.get(name)

    def list_all(self) -> list[T]:
        return list(self._entities.values())


class RuntimeSemanticCatalog:
    """从 active snapshot manifest 还原出的运行时语义资产视图。"""

    def __init__(
        self,
        *,
        objects: list[BusinessObject],
        metrics: list[BusinessMetric],
        glossary: list[GlossaryEntry],
        relations: list[BusinessRelation],
        actions: list[BusinessAction],
        cubes: list[CubeDefinition],
        snapshot_id: str | None,
        release_id: str | None,
        runtime_trace: dict[str, Any] | None = None,
    ):
        self.object_repository = RuntimeRepository(objects)
        self.metric_repository = RuntimeRepository(metrics)
        self.glossary_repository = RuntimeRepository(glossary, key_attr="term")
        self.relation_repository = RuntimeRepository(relations)
        self.action_repository = RuntimeRepository(actions)
        self.cube_repository = RuntimeRepository(cubes)
        self.runtime_trace = runtime_trace or {}
        self.binding_metadata = {
            "runtime_snapshot_id": snapshot_id,
            "runtime_release_id": release_id,
        }
        release_no = (self.runtime_trace.get("version_pin") or {}).get("release_no")
        if release_no is not None:
            self.binding_metadata["runtime_release_no"] = release_no

    @classmethod
    def from_manifest(cls, manifest: dict[str, Any]) -> "RuntimeSemanticCatalog":
        objects: list[BusinessObject] = []
        metrics: list[BusinessMetric] = []
        glossary: list[GlossaryEntry] = []
        relations: list[BusinessRelation] = []
        actions: list[BusinessAction] = []
        cubes: list[CubeDefinition] = []
        asset_manifest = manifest.get("asset_manifest_json") or {}
        for asset in asset_manifest.get("assets") or []:
            if asset.get("status") != "published":
                continue
            spec = asset.get("spec") or asset.get("spec_json") or {}
            cls._collect_spec(
                spec=spec,
                objects=objects,
                metrics=metrics,
                glossary=glossary,
                relations=relations,
                actions=actions,
                cubes=cubes,
            )
        return cls(
            objects=objects,
            metrics=metrics,
            glossary=glossary,
            relations=relations,
            actions=actions,
            cubes=cubes,
            snapshot_id=manifest.get("snapshot_id"),
            release_id=manifest.get("release_id"),
            runtime_trace=cls._runtime_trace(manifest),
        )

    def get_metric(self, name: str) -> BusinessMetric | None:
        return self.metric_repository.get(name)

    def get_object(self, name: str) -> BusinessObject | None:
        return self.object_repository.get(name)

    def get_relation(self, name: str) -> BusinessRelation | None:
        return self.relation_repository.get(name)

    def get_action(self, name: str) -> BusinessAction | None:
        return self.action_repository.get(name)

    def list_entities(self, entity_type: str) -> list[Any]:
        repositories = {
            "object": self.object_repository,
            "metric": self.metric_repository,
            "glossary": self.glossary_repository,
            "relation": self.relation_repository,
            "action": self.action_repository,
            "cube": self.cube_repository,
        }
        repository = repositories.get(entity_type)
        return repository.list_all() if repository is not None else []

    @staticmethod
    def _runtime_trace(manifest: dict[str, Any]) -> dict[str, Any]:
        asset_manifest = manifest.get("asset_manifest_json") or {}
        assets = manifest.get("asset_trace")
        if assets is None:
            assets = [
                {
                    "asset_id": asset.get("asset_id"),
                    "asset_type": asset.get("asset_type"),
                    "asset_key": asset.get("asset_key"),
                    "revision_id": asset.get("revision_id"),
                    "spec_checksum": asset.get("spec_checksum"),
                    "status": asset.get("status"),
                }
                for asset in asset_manifest.get("assets") or []
            ]
        version_pin = manifest.get("version_pin") or {
            "snapshot_id": manifest.get("snapshot_id"),
            "release_id": manifest.get("release_id"),
            "asset_count": len(assets),
            "asset_revision_ids": [item["revision_id"] for item in assets if item.get("revision_id")],
        }
        return {
            "version_pin": version_pin,
            "assets": assets,
            "bindings": manifest.get("binding_trace") or {},
            "policies": manifest.get("policy_trace") or {},
        }

    @classmethod
    def _collect_spec(
        cls,
        *,
        spec: dict[str, Any],
        objects: list[BusinessObject],
        metrics: list[BusinessMetric],
        glossary: list[GlossaryEntry],
        relations: list[BusinessRelation],
        actions: list[BusinessAction],
        cubes: list[CubeDefinition],
    ) -> None:
        cls._append_one(objects, BusinessObject, spec.get("object"))
        cls._append_one(metrics, BusinessMetric, spec.get("metric"))
        cls._append_one(glossary, GlossaryEntry, spec.get("glossary"))
        cls._append_one(relations, BusinessRelation, spec.get("relation"))
        cls._append_one(actions, BusinessAction, spec.get("action"))
        cls._append_one(cubes, CubeDefinition, spec.get("cube"))

        ontology = spec.get("ontology") or {}
        cls._append_many(objects, BusinessObject, ontology.get("objects"))
        cls._append_many(metrics, BusinessMetric, ontology.get("metrics"))
        cls._append_many(glossary, GlossaryEntry, ontology.get("glossary") or ontology.get("glossary_entries"))
        cls._append_many(relations, BusinessRelation, ontology.get("relations"))
        cls._append_many(actions, BusinessAction, ontology.get("actions"))

        if spec.get("name") and spec.get("dimensions") and spec.get("measures"):
            cls._append_one(cubes, CubeDefinition, spec)

    @staticmethod
    def _append_many(container: list[T], model: type[T], values: Any) -> None:
        for value in values or []:
            RuntimeSemanticCatalog._append_one(container, model, value)

    @staticmethod
    def _append_one(container: list[T], model: type[T], value: Any) -> None:
        if value is None:
            return
        if isinstance(value, model):
            container.append(value)
            return
        if not isinstance(value, dict):
            return
        try:
            container.append(model(**value))
        except ValidationError as exc:
            raise ValueError(f"invalid_runtime_asset_spec:{model.__name__}") from exc
