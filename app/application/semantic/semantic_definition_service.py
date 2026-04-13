"""
语义定义服务
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.application.semantic.metric_semantics_service import MetricSemanticsService
from app.application.semantic.semantic_runtime_binding_service import (
    SemanticRuntimeBindingService,
)
from app.domain.semantic.compiler import CompilationError
from app.domain.semantic.entities import (
    CubeDefinition,
    DimensionDef,
    ViewCubeRef,
    ViewDefinition,
)
from app.domain.semantic.join_graph import JoinGraph, JoinPathNotFoundError, JoinPathTooDeepError
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.semantic.ports.domain_repository import IDomainRepository
from app.domain.semantic.ports.recipe_repository import IRecipeRepository
from app.domain.semantic.ports.view_repository import IViewRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class SemanticDefinitionService:
    def __init__(
        self,
        cube_repo: ICubeRepository,
        view_repo: IViewRepository,
        recipe_repo: IRecipeRepository,
        enum_loader: Optional[Callable[[str], Optional[Dict[str, str]]]] = None,
        metric_semantics_service: Optional[MetricSemanticsService] = None,
        registry_repo: Optional[ISemanticRegistryRepository] = None,
        runtime_binding_service: Optional[SemanticRuntimeBindingService] = None,
        domain_repo: Optional[IDomainRepository] = None,
    ):
        self._cube_repo = cube_repo
        self._view_repo = view_repo
        self._recipe_repo = recipe_repo
        self._uses_default_enum_loader = enum_loader is None
        self._enum_loader = enum_loader or self._load_dynamic_enum
        self._metric_semantics_service = metric_semantics_service or MetricSemanticsService()
        self._registry_repo = registry_repo
        self._runtime_binding_service = runtime_binding_service
        self._domain_repo = domain_repo
        self._enum_cache: Dict[str, Optional[Dict[str, str]]] = {}
        self._graph: Optional[JoinGraph] = None

    def invalidate_cache(self) -> None:
        self._enum_cache.clear()
        self._graph = None

    def list_cubes(self) -> List[Dict[str, Any]]:
        cubes = self._cube_repo.list_all()
        projection_index = self._build_cube_domain_projection_index(cubes)
        result = []
        now = datetime.utcnow()
        for cube in cubes:
            state_summary = self._build_cube_state_summary(cube, now=now)
            projection = projection_index.get(
                cube.name,
                {"domain_ids": [], "domains": [], "domain_count": 0},
            )
            domain_id, domain_name = self._select_primary_domain(cube, projection["domains"])
            result.append({
                "name": cube.name,
                "title": cube.title,
                "description": cube.description or "",
                "table": cube.table,
                "dimensions": list(cube.dimensions.keys()),
                "measures": list(cube.measures.keys()),
                "dimension_count": len(cube.dimensions),
                "measure_count": len(cube.measures),
                "join_count": len(cube.joins),
                "status": cube.status,
                "domain_id": domain_id,
                "domain_name": domain_name,
                "domain_ids": projection["domain_ids"],
                "domains": projection["domains"],
                "domain_count": projection["domain_count"],
                "source_id": cube.source_id,
                "source_database": cube.source_database,
                "source_schema": cube.source_schema,
                "sync_status": state_summary.get("sync_status"),
                "state_summary": state_summary,
            })
        return result

    def describe_cube(self, cube_name: str) -> Dict[str, Any]:
        cube = self._cube_repo.get(cube_name)
        if cube is None:
            return {"error": f"未找到 Cube: {cube_name}"}

        self._sync_cube_registry(cube)
        diagnostics = self.validate_cube(cube)
        projection = self._build_cube_domain_projection_index([cube]).get(
            cube.name,
            {"domain_ids": [], "domains": [], "domain_count": 0},
        )
        domain_id, domain_name = self._select_primary_domain(cube, projection["domains"])
        dims = self._build_dimensions(cube, diagnostics)
        measures = self._metric_semantics_service.build_metric_map(cube.measures)
        segments = {k: {"title": s.title} for k, s in cube.segments.items()}
        joins = {
            alias: {"target_cube": j.cube, "type": j.type}
            for alias, j in cube.joins.items()
        }

        recipes = self._recipe_repo.get_by_cube(cube_name)
        recipe_examples = []
        for recipe in recipes[:3]:
            for example in recipe.examples[:2]:
                recipe_examples.append({
                    "question": example.question,
                    "dsl": example.dsl,
                    "notes": example.notes,
                })

        result: Dict[str, Any] = {
            "name": cube.name,
            "title": cube.title,
            "description": cube.description or "",
            "table": cube.table,
            "status": cube.status,
            "domain_id": domain_id,
            "domain_name": domain_name,
            "domain_ids": projection["domain_ids"],
            "domains": projection["domains"],
            "domain_count": projection["domain_count"],
            "source_id": cube.source_id,
            "source_database": cube.source_database,
            "source_schema": cube.source_schema,
            "dimensions": dims,
            "measures": measures,
            "segments": segments,
            "joins": joins,
            "grain": cube.grain,
            "entity_key": cube.entity_key,
            "diagnostics": diagnostics,
            "source_binding_summary": self._build_source_binding_summary(cube),
            "state_summary": self._build_cube_state_summary(cube),
        }
        if cube.partition:
            result["partition"] = {"field": cube.partition.field, "format": cube.partition.format}
        if cube.default_filters:
            result["default_filters"] = [
                {"sql": item.sql, "description": item.description}
                for item in cube.default_filters
            ]
        if recipe_examples:
            result["examples"] = recipe_examples
        return result

    def _resolve_cube_domain(self, cube: CubeDefinition) -> Tuple[Optional[str], Optional[str]]:
        projection = self._build_cube_domain_projection_index([cube]).get(
            cube.name,
            {"domains": []},
        )
        return self._select_primary_domain(cube, projection["domains"])

    def list_view_summaries(self, public_only: bool = True) -> List[Dict[str, Any]]:
        result: List[Dict[str, Any]] = []
        for view in self.list_views(public_only=public_only):
            summary = self._build_view_state_summary(view)
            publish_status = summary.get("publish_status", "unpublished")
            status = "active" if publish_status == "published" else "draft"
            cubes = sorted(
                {
                    cube_name
                    for ref in view.cubes
                    for cube_name in [ref.join_path.split(".", 1)[0].strip()]
                    if cube_name
                }
            )
            result.append(
                {
                    "name": view.name,
                    "title": view.title,
                    "description": view.description or "",
                    "public": view.public,
                    "cube_count": len(view.cubes),
                    "cubes": cubes,
                    "status": status,
                    "state_summary": {
                        **summary,
                        "object_type": "view",
                        "status": status,
                    },
                    "publish_summary": {
                        "publish_status": publish_status,
                        "last_published_at": summary.get("last_published_at"),
                    },
                }
            )
        return result

    def list_recipe_summaries(self) -> List[Dict[str, Any]]:
        result: List[Dict[str, Any]] = []
        for recipe in self._recipe_repo.list_all():
            related_cubes = sorted(recipe.extract_cube_names())
            status = "active" if len(recipe.examples) > 0 else "draft"
            result.append(
                {
                    "name": recipe.name,
                    "title": recipe.title,
                    "tags": recipe.tags,
                    "example_count": len(recipe.examples),
                    "related_cubes": related_cubes,
                    "state_summary": {
                        "object_type": "recipe",
                        "status": status,
                    },
                }
            )
        return result

    def list_views(self, public_only: bool = True) -> List[ViewDefinition]:
        views = self._view_repo.list_all()
        if public_only:
            return [view for view in views if view.public]
        return views

    def describe_view(self, view_name: str, include_private: bool = False) -> Dict[str, Any]:
        view = self._view_repo.get(view_name)
        if view is None:
            return {"error": f"未找到 View: {view_name}"}
        if not include_private and not view.public:
            return {"error": f"View '{view_name}' 未公开暴露"}

        self._sync_view_registry(view)
        data = view.model_dump()
        data["diagnostics"] = self.validate_view(view)
        summary = self._build_view_state_summary(view)
        data["publish_summary"] = {
            "definition_hash": summary.get("definition_hash"),
            "publish_status": summary.get("publish_status", "unpublished"),
            "last_published_at": summary.get("last_published_at"),
        }
        data["drift_summary"] = {
            "last_drift_status": summary.get("last_drift_status", "unknown"),
            "last_drift_checked_at": summary.get("last_drift_checked_at"),
        }
        return data

    def expand_view_to_dsl(self, view: ViewDefinition) -> Dict[str, Any]:
        dimensions: List[str] = []
        measures: List[str] = []
        field_mappings: List[Dict[str, Any]] = []
        join_path: List[str] = []

        for ref in view.cubes:
            waypoints, cube = self._resolve_view_reference(view.name, ref)
            if not join_path:
                join_path = waypoints

            dim_names, measure_names = self._resolve_view_includes(cube, ref, view.name)
            prefix = f"{cube.title}." if ref.prefix else ""
            for dim_name in dim_names:
                dimensions.append(f"{cube.name}.{dim_name}")
                field_mappings.append(self._build_view_field_mapping(cube, dim_name, "dimension", prefix))
            for measure_name in measure_names:
                measures.append(f"{cube.name}.{measure_name}")
                field_mappings.append(self._build_view_field_mapping(cube, measure_name, "metric", prefix))

        return {
            "dimensions": dimensions,
            "measures": measures,
            "join_path": join_path if len(join_path) >= 2 else None,
            "field_mappings": field_mappings,
        }

    def validate_cube(self, cube: CubeDefinition) -> List[Dict[str, Any]]:
        diagnostics: List[Dict[str, Any]] = []
        if cube.source_id is None:
            diagnostics.append({
                "level": "warn",
                "kind": "missing_source_binding",
                "field": f"{cube.name}.source_id",
                "message": "Cube 未绑定真实 source_id，仍处于兼容模式",
            })
        elif self._runtime_binding_service is not None:
            try:
                self._runtime_binding_service.resolve_cube_datasource(cube)
            except Exception as exc:
                diagnostics.append({
                    "level": "error",
                    "kind": "invalid_source_binding",
                    "field": f"{cube.name}.source_id",
                    "message": str(exc),
                })
        if cube.grain and cube.grain not in cube.dimensions:
            diagnostics.append({
                "level": "error",
                "kind": "invalid_grain_dimension",
                "field": f"{cube.name}.grain",
                "message": f"grain 字段不存在于 Cube 维度中: {cube.grain}",
            })
        if cube.entity_key and cube.entity_key not in cube.dimensions:
            diagnostics.append({
                "level": "error",
                "kind": "invalid_entity_key_dimension",
                "field": f"{cube.name}.entity_key",
                "message": f"entity_key 字段不存在于 Cube 维度中: {cube.entity_key}",
            })
        for alias, join_def in cube.joins.items():
            target_cube = self._cube_repo.get(join_def.cube)
            if target_cube is None:
                diagnostics.append({
                    "level": "error",
                    "kind": "missing_join_target_cube",
                    "field": f"{cube.name}.joins.{alias}",
                    "message": f"JOIN 目标 Cube 不存在: {join_def.cube}",
                })
        for dim_name, dim in cube.dimensions.items():
            if dim.foreign_key:
                target_cube = self._cube_repo.get(dim.foreign_key.cube)
                if target_cube is None:
                    diagnostics.append({
                        "level": "error",
                        "kind": "missing_foreign_key_cube",
                        "field": f"{cube.name}.{dim_name}",
                        "message": f"外键目标 Cube 不存在: {dim.foreign_key.cube}",
                    })
                elif dim.foreign_key.field not in target_cube.dimensions:
                    diagnostics.append({
                        "level": "error",
                        "kind": "missing_foreign_key_field",
                        "field": f"{cube.name}.{dim_name}",
                        "message": f"外键字段不存在: {dim.foreign_key.cube}.{dim.foreign_key.field}",
                    })
            if dim.enum_source and not self._resolve_dimension_enum(cube, dim):
                diagnostics.append({
                    "level": "warn",
                    "kind": "enum_source_unavailable",
                    "field": f"{cube.name}.{dim_name}",
                    "message": f"动态枚举未加载成功: {dim.enum_source.dict_type}",
                })
        return diagnostics

    def validate_view(self, view: ViewDefinition) -> List[Dict[str, Any]]:
        diagnostics: List[Dict[str, Any]] = []
        for ref in view.cubes:
            try:
                cube_path, terminal_cube = self._resolve_view_reference(view.name, ref)
                self._resolve_view_includes(terminal_cube, ref, view.name)
                diagnostics.append({
                    "level": "ok",
                    "kind": "view_ref_resolved",
                    "field": ref.join_path,
                    "message": f"JOIN 路径有效，终点 Cube 为 {cube_path[-1]}",
                })
            except CompilationError as exc:
                diagnostics.append({
                    "level": "error",
                    "kind": "invalid_view_reference",
                    "field": ref.join_path,
                    "message": str(exc),
                })
        active_errors = self._validate_view_dependencies(view)
        diagnostics.extend(active_errors)
        return diagnostics

    def _build_dimensions(
        self,
        cube: CubeDefinition,
        diagnostics: List[Dict[str, Any]],
    ) -> Dict[str, Dict[str, Any]]:
        dims = {}
        for key, dim in cube.dimensions.items():
            info: Dict[str, Any] = {
                "title": dim.title,
                "type": dim.type,
                "sql": dim.sql,
                "description": dim.description,
                "source_data_type": dim.source_data_type,
                "format": dim.format,
                "synonyms": list(dim.synonyms or []),
                "tags": list(dim.tags or []),
            }
            if dim.enum:
                info["enum"] = {str(enum_key): enum_val for enum_key, enum_val in dim.enum.items()}
            elif dim.enum_source:
                resolved_enum = self._resolve_dimension_enum(cube, dim)
                if resolved_enum:
                    info["enum"] = resolved_enum
                else:
                    diagnostics.append({
                        "level": "warn",
                        "kind": "enum_source_unavailable",
                        "field": f"{cube.name}.{key}",
                        "message": f"动态枚举未加载成功: {dim.enum_source.dict_type}",
                    })
            if dim.primary_key:
                info["primary_key"] = True
            if dim.foreign_key:
                info["foreign_key"] = {
                    "cube": dim.foreign_key.cube,
                    "field": dim.foreign_key.field,
                }
            dims[key] = info
        return dims

    def _resolve_view_reference(
        self,
        view_name: str,
        ref: ViewCubeRef,
    ) -> Tuple[List[str], CubeDefinition]:
        waypoints = [part.strip() for part in ref.join_path.split(".") if part.strip()]
        if not waypoints:
            raise CompilationError(f"View '{view_name}' 的 join_path 不能为空")

        root_cube = self._cube_repo.get(waypoints[0])
        if root_cube is None:
            raise CompilationError(f"View '{view_name}' 引用了不存在的 Cube: '{waypoints[0]}'")

        graph = self._get_join_graph()
        if len(waypoints) >= 2 and graph is not None:
            try:
                graph.find_path_through(waypoints)
            except (JoinPathNotFoundError, JoinPathTooDeepError) as exc:
                raise CompilationError(str(exc)) from exc

        terminal_cube = self._cube_repo.get(waypoints[-1])
        if terminal_cube is None:
            raise CompilationError(f"View '{view_name}' 的终点 Cube 不存在: '{waypoints[-1]}'")
        return waypoints, terminal_cube

    @staticmethod
    def _resolve_view_includes(
        cube: CubeDefinition,
        ref: ViewCubeRef,
        view_name: str,
    ) -> Tuple[List[str], List[str]]:
        excludes = set(ref.excludes)
        if ref.includes == "*":
            dim_names = [name for name in cube.dimensions if name not in excludes]
            measure_names = [name for name in cube.measures if name not in excludes]
        else:
            all_dim_keys = set(cube.dimensions.keys())
            all_measure_keys = set(cube.measures.keys())
            dim_names = [field for field in ref.includes if field in all_dim_keys and field not in excludes]
            measure_names = [field for field in ref.includes if field in all_measure_keys and field not in excludes]
            unknown = [field for field in ref.includes if field not in all_dim_keys and field not in all_measure_keys]
            if unknown:
                raise CompilationError(f"View '{view_name}' 引用了不存在的字段: {', '.join(unknown)}")
        return dim_names, measure_names

    def _resolve_dimension_enum(self, cube: CubeDefinition, dim: DimensionDef) -> Optional[Dict[str, str]]:
        if dim.enum:
            return {str(enum_key): enum_val for enum_key, enum_val in dim.enum.items()}
        if dim.enum_source is None:
            return None
        raw_dict_type = dim.enum_source.dict_type
        cache_key = f"{cube.name}:{raw_dict_type}"
        if cache_key not in self._enum_cache:
            loader_arg = cache_key if self._uses_default_enum_loader else raw_dict_type
            self._enum_cache[cache_key] = self._enum_loader(loader_arg)
        return self._enum_cache[cache_key]

    def _load_dynamic_enum(self, dict_type: str) -> Optional[Dict[str, str]]:
        try:
            cube_name, raw_dict_type = dict_type.split(":", 1)
            cube = self._cube_repo.get(cube_name)
            if cube is None or self._runtime_binding_service is None:
                return None
            return self._runtime_binding_service.fetch_dict_enums(cube, raw_dict_type)
        except Exception as exc:  # pragma: no cover - 防御性兜底
            logger.warning("semantic_enum_load_failed", dict_type=dict_type, error=str(exc))
            return None

    @staticmethod
    def _build_view_field_mapping(
        cube: CubeDefinition,
        field_name: str,
        business_type: str,
        display_prefix: str = "",
    ) -> Dict[str, Any]:
        field_meta = cube.dimensions.get(field_name) if business_type == "dimension" else cube.measures.get(field_name)
        display_name = f"{display_prefix}{field_meta.title}" if field_meta else field_name
        return {
            "physical_name": f"{cube.name}__{field_name}",
            "source_ref": f"{cube.name}.{field_name}",
            "source_cube": cube.name,
            "source_field": field_name,
            "display_name": display_name,
            "business_type": business_type,
        }

    def _sync_cube_registry(self, cube: CubeDefinition) -> None:
        if self._registry_repo is None:
            return
        self._registry_repo.upsert(
            "cube",
            cube.name,
            source_id=cube.source_id,
            status=cube.status,
            definition_hash=self._definition_hash(cube.model_dump(mode="json")),
            last_loaded_at=datetime.utcnow(),
            measure_summary_snapshot=self._build_measure_summary_snapshot(cube),
            certified_measure_list=[name for name, measure in cube.measures.items() if measure.certified],
            source_binding_summary=self._build_source_binding_summary(cube),
        )
        self._registry_repo.commit()

    def _sync_view_registry(self, view: ViewDefinition) -> None:
        if self._registry_repo is None:
            return
        self._registry_repo.upsert(
            "view",
            view.name,
            definition_hash=self._definition_hash(view.model_dump(mode="json")),
            last_loaded_at=datetime.utcnow(),
        )
        self._registry_repo.commit()

    def _build_cube_state_summary(self, cube: CubeDefinition, now: Optional[datetime] = None) -> Dict[str, Any]:
        now = now or datetime.utcnow()
        default = {
            "source_id": cube.source_id,
            "status": cube.status,
            "definition_hash": self._definition_hash(cube.model_dump(mode="json")),
            "last_loaded_at": now.isoformat(),
            "last_drift_status": "unknown",
            "last_drift_checked_at": None,
            "sync_status": cube.sync_status if hasattr(cube, "sync_status") else "warn",
            "source_binding_summary": self._build_source_binding_summary(cube),
        }
        if self._registry_repo is None:
            return default
        entry = self._registry_repo.get("cube", cube.name)
        if entry is None:
            return default
        summary = entry.to_summary()
        summary["sync_status"] = self._to_sync_status(summary.get("last_drift_status"))
        summary.setdefault("status", cube.status)
        summary.setdefault("source_id", cube.source_id)
        summary.setdefault("source_binding_summary", self._build_source_binding_summary(cube))
        return summary

    def _build_view_state_summary(self, view: ViewDefinition) -> Dict[str, Any]:
        default = {
            "definition_hash": self._definition_hash(view.model_dump(mode="json")),
            "publish_status": "unpublished",
            "last_published_at": None,
            "last_drift_status": "unknown",
            "last_drift_checked_at": None,
        }
        if self._registry_repo is None:
            return default
        entry = self._registry_repo.get("view", view.name)
        return entry.to_summary() if entry else default

    def _build_cube_domain_projection_index(self, cubes: List[CubeDefinition]) -> Dict[str, Dict[str, Any]]:
        mapping: Dict[str, Dict[str, Any]] = {
            cube.name: {
                "domain_ids": [],
                "domains": [],
                "domain_count": 0,
            }
            for cube in cubes
        }
        if self._domain_repo is None or not cubes:
            return mapping

        cube_names = set(mapping.keys())
        for domain in self._domain_repo.list_all():
            domain_payload = {
                "id": domain.id or domain.code,
                "code": domain.code,
                "name": domain.name,
            }
            seen: set[str] = set()
            for cube_name in domain.cubes:
                if cube_name not in cube_names or cube_name in seen:
                    continue
                seen.add(cube_name)
                mapping[cube_name]["domains"].append(domain_payload)

        for payload in mapping.values():
            payload["domains"] = sorted(payload["domains"], key=lambda item: item["code"])
            payload["domain_ids"] = [item["id"] for item in payload["domains"]]
            payload["domain_count"] = len(payload["domains"])
        return mapping

    def _select_primary_domain(
        self,
        cube: CubeDefinition,
        domains: List[Dict[str, Any]],
    ) -> Tuple[Optional[str], Optional[str]]:
        if self._domain_repo is not None and cube.domain_id:
            domain = self._domain_repo.get(cube.domain_id) or self._domain_repo.get_by_code(cube.domain_id)
            if domain is not None:
                return domain.id or domain.code, domain.name
        if domains:
            primary = sorted(domains, key=lambda item: item["code"])[0]
            return primary["id"], primary["name"]
        return cube.domain_id, None

    @staticmethod
    def _definition_hash(payload: Dict[str, Any]) -> str:
        return hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()

    @staticmethod
    def _to_sync_status(drift_status: Optional[str]) -> str:
        if drift_status == "error":
            return "error"
        if drift_status == "ok":
            return "ok"
        return "warn"

    def _get_join_graph(self) -> JoinGraph:
        if self._graph is None:
            self._graph = JoinGraph(self._cube_repo.list_all())
        return self._graph

    def _build_measure_summary_snapshot(self, cube: CubeDefinition) -> Dict[str, Any]:
        return {
            "count": len(cube.measures),
            "names": list(cube.measures.keys()),
        }

    def _build_source_binding_summary(self, cube: CubeDefinition) -> Dict[str, Any]:
        if self._runtime_binding_service is None:
            return {
                "source_id": cube.source_id,
                "source_type": cube.data_source,
                "database": cube.source_database,
                "schema": cube.source_schema,
                "display": cube.table,
            }
        return self._runtime_binding_service.resolve_source_binding_summary(cube)

    def _validate_view_dependencies(self, view: ViewDefinition) -> List[Dict[str, Any]]:
        diagnostics: List[Dict[str, Any]] = []
        for ref in view.cubes:
            path = [part.strip() for part in ref.join_path.split(".") if part.strip()]
            for cube_name in path:
                cube = self._cube_repo.get(cube_name)
                if cube is None:
                    continue
                if cube.status != "active":
                    diagnostics.append({
                        "level": "warn" if cube.status == "deprecated" else "error",
                        "kind": "inactive_view_dependency",
                        "field": ref.join_path,
                        "message": (
                            f"View '{view.name}' 依赖的 Cube '{cube_name}' 当前状态为 "
                            f"'{cube.status}'，不应进入默认发布/消费链路"
                        ),
                    })
        return diagnostics
