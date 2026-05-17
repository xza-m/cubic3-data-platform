"""业务上下文资产画布服务。"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

from app.domain.semantic.ports.catalog_repository import ICatalogRepository
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.semantic.ports.domain_repository import IDomainRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


class DomainCanvasService:
    def __init__(
        self,
        domain_repo: IDomainRepository,
        catalog_repo: ICatalogRepository | None,
        cube_repo: ICubeRepository,
        registry_repo: ISemanticRegistryRepository | None = None,
    ):
        self._domain_repo = domain_repo
        self._catalog_repo = catalog_repo
        self._cube_repo = cube_repo
        self._registry_repo = registry_repo

    def get_canvas(self, domain_id: str) -> Dict[str, Any]:
        domain = self._domain_repo.get(domain_id) or self._domain_repo.get_by_code(domain_id)
        if domain is None:
            raise ApplicationException(f"未找到领域: {domain_id}")
        projection_index = self._build_cube_domain_projection_index()
        domain_registry = None
        if self._registry_repo:
            try:
                domain_registry = self._registry_repo.get("domain", domain.id or domain.code)
            except Exception as exc:
                logger.warning("domain_canvas_registry_failed", domain=domain.code, error=str(exc))

        nodes: List[Dict[str, Any]] = []
        for cube_name in domain.cubes:
            cube = self._cube_repo.get(cube_name)
            if cube is None:
                continue
            registry = None
            if self._registry_repo:
                try:
                    registry = self._registry_repo.get("cube", cube.name)
                except Exception as exc:
                    logger.warning("domain_canvas_cube_registry_failed", cube=cube.name, error=str(exc))
            summary = registry.to_summary() if registry else {}
            projection = projection_index.get(
                cube.name,
                {"related_domain_ids": [], "related_domain_names": [], "domain_count": 0},
            )
            nodes.append(
                {
                    "id": cube.name,
                    "title": cube.title,
                    "type": "fact" if len(cube.measures) > 2 else "dimension",
                    "dimensions": len(cube.dimensions),
                    "measures": len(cube.measures),
                    "status": cube.status,
                    "source_id": cube.source_id,
                    "domain_id": domain.id or domain.code,
                    "state_summary": summary,
                    "source_binding_summary": summary.get("source_binding_summary"),
                    **projection,
                }
            )

        edges: List[Dict[str, Any]] = []

        library = []
        domain_cube_set = set(domain.cubes)
        for cube in self._cube_repo.list_all():
            if cube.status != "active":
                continue
            projection = projection_index.get(
                cube.name,
                {"related_domain_ids": [], "related_domain_names": [], "domain_count": 0},
            )
            library.append(
                {
                    "name": cube.name,
                    "title": cube.title,
                    "status": cube.status,
                    "source_id": cube.source_id,
                    "source_database": cube.source_database,
                    "source_schema": cube.source_schema,
                    "dimensions": list(cube.dimensions.keys()),
                    "measures": list(cube.measures.keys()),
                    "dimension_count": len(cube.dimensions),
                    "measure_count": len(cube.measures),
                    "in_domain": cube.name in domain_cube_set,
                    **projection,
                }
            )

        return {
            "domain": {
                "id": domain.id,
                "code": domain.code,
                "name": domain.name,
                "catalog_code": domain.catalog_code,
                "catalog_name": self._resolve_catalog_name(domain.catalog_code),
                "description": domain.description,
                "status": domain.status,
                "owner": domain.owner,
                "state_summary": domain_registry.to_summary() if domain_registry else None,
                "governance_summary": self._build_governance_summary(domain),
            },
            "nodes": nodes,
            "edges": edges,
            "library_cubes": library,
        }

    def _resolve_catalog_name(self, catalog_code: str | None) -> str | None:
        if self._catalog_repo is None:
            return None
        code = (catalog_code or "").strip()
        if not code:
            code = "default"
        catalog = self._catalog_repo.get(code)
        return catalog.name if catalog is not None else None

    def _build_cube_domain_projection_index(self) -> dict[str, dict[str, Any]]:
        mapping: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "related_domain_ids": [],
                "related_domain_names": [],
                "domain_count": 0,
            }
        )
        for domain in self._domain_repo.list_all():
            domain_key = domain.id or domain.code
            seen: set[str] = set()
            for cube_name in domain.cubes:
                if cube_name in seen:
                    continue
                seen.add(cube_name)
                entry = mapping[cube_name]
                entry["related_domain_ids"].append(domain_key)
                entry["related_domain_names"].append(domain.name)
        for entry in mapping.values():
            entry["domain_count"] = len(entry["related_domain_ids"])
        return dict(mapping)

    def _build_governance_summary(self, domain) -> dict[str, int]:
        summary = {
            "cube_count": len(domain.cubes),
            "active_cube_count": 0,
            "draft_cube_count": 0,
            "deprecated_cube_count": 0,
            "dangling_cube_count": 0,
        }
        for cube_name in domain.cubes:
            cube = self._cube_repo.get(cube_name)
            if cube is None:
                summary["dangling_cube_count"] += 1
                continue
            if cube.status == "active":
                summary["active_cube_count"] += 1
            elif cube.status == "draft":
                summary["draft_cube_count"] += 1
            elif cube.status in {"deprecated", "archived"}:
                summary["deprecated_cube_count"] += 1
        return summary
