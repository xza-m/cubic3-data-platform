"""语义层兼容门面服务

职责：
1. 对旧调用方暴露稳定接口
2. 将定义、查询、发布、漂移检测职责委托给专用服务
3. 自身不再承载核心实现逻辑
"""
from __future__ import annotations

from typing import Any, Dict, List


class SemanticLayerService:
    def __init__(
        self,
        definition_service: Any = None,
        query_service: Any = None,
        recipe_repo: Any = None,
        cube_repo: Any = None,
        view_repo: Any = None,
        domain_repo: Any = None,
        dialect: Any = None,
        enum_loader: Any = None,
        registry_repo: Any = None,
        runtime_binding_service: Any = None,
    ):
        if definition_service is None or query_service is None:
            from app.application.semantic.metric_semantics_service import MetricSemanticsService
            from app.application.semantic.semantic_definition_service import SemanticDefinitionService
            from app.application.semantic.semantic_query_service import SemanticQueryService

            query_service = query_service or SemanticQueryService(
                cube_repo=cube_repo,
                dialect=dialect,
                runtime_binding_service=runtime_binding_service,
                domain_repo=domain_repo,
            )
            definition_service = definition_service or SemanticDefinitionService(
                cube_repo=cube_repo,
                view_repo=view_repo,
                recipe_repo=recipe_repo,
                enum_loader=enum_loader,
                metric_semantics_service=MetricSemanticsService(),
                registry_repo=registry_repo,
                runtime_binding_service=runtime_binding_service,
                domain_repo=domain_repo,
            )

        self._definition_service = definition_service
        self._query_service = query_service
        self._recipe_repo = recipe_repo or getattr(definition_service, "_recipe_repo", None)
        self._cube_repo = cube_repo or getattr(definition_service, "_cube_repo", None)
        self._view_repo = view_repo or getattr(definition_service, "_view_repo", None)
        self._domain_repo = domain_repo or getattr(definition_service, "_domain_repo", None)

    def invalidate_cache(self) -> None:
        self._definition_service.invalidate_cache()
        self._query_service.invalidate_cache()

    def list_cubes(self) -> List[Dict[str, Any]]:
        return self._definition_service.list_cubes()

    def describe_cube(self, cube_name: str) -> Dict[str, Any]:
        return self._definition_service.describe_cube(cube_name)

    def list_views(self, public_only: bool = True):
        return self._definition_service.list_views(public_only=public_only)

    def describe_view(self, view_name: str, include_private: bool = False) -> Dict[str, Any]:
        return self._definition_service.describe_view(view_name, include_private=include_private)

    def compile_query(self, dsl_dict: Dict[str, Any]):
        return self._query_service.compile_query(dsl_dict)

    def expand_view_to_dsl(self, view: Any) -> Dict[str, Any]:
        return self._definition_service.expand_view_to_dsl(view)

    def validate_cube(self, cube: Any):
        return self._definition_service.validate_cube(cube)

    def validate_view(self, view: Any):
        return self._definition_service.validate_view(view)

    def query(self, dsl_dict: Dict[str, Any], adapter: Any) -> Dict[str, Any]:
        return self._query_service.query(dsl_dict, adapter)

    def compile_and_execute(self, dsl_dict: Dict[str, Any], adapter: Any) -> Dict[str, Any]:
        return self._query_service.compile_and_execute(dsl_dict, adapter)
