"""语义层 API 装配上下文。

`build_semantic_context` 把蓝图工厂的服务装配与共享 helper 收敛到一处：
- 生产路径：`app/__init__.py` 通过 DI 容器传入全部核心服务；
- fallback 装配仅服务于单测 / 脚本 bootstrap（传入部分 Mock 时补齐其余依赖），
  不应在生产代码中新增对 fallback 的依赖。
"""
import os
from types import SimpleNamespace

from flask import current_app, request

from app.shared.response import error
from ._shared import logger


def _semantic_base():
    """经包属性解析，保证单测对 ``semantic_api._semantic_base`` 的 monkeypatch 生效。"""
    from app.interfaces.api.v1 import semantic as _semantic_pkg

    return _semantic_pkg._semantic_base()


def build_semantic_context(
    semantic_service,
    dataset_repo,
    dataset_handler,
    publish_service=None,
    registry_repo=None,
    modeling_service=None,
    modeling_source_service=None,
    domain_modeling_service=None,
    domain_canvas_service=None,
    query_adapter_getter=None,
    view_materialize_service=None,
    cube_listing_service=None,
    runtime_snapshot_service=None,
    mapper_service=None,
    field_candidate_service=None,
):
    # ── fallback 装配（测试 / bootstrap 路径） ──────────────────────────────
    if field_candidate_service is None:
        from app.application.semantic.field_candidates import FieldCandidateService

        field_candidate_service = FieldCandidateService()
    if publish_service is None:
        from app.application.semantic.view_publish_service import ViewPublishService

        publish_service = ViewPublishService(
            definition_service=semantic_service._definition_service,
            query_service=semantic_service._query_service,
            dataset_repo=dataset_repo,
            dataset_handler=dataset_handler,
            registry_repo=registry_repo,
        )
    if modeling_service is None:
        from app.application.semantic.cube_modeling_service import CubeModelingService
        from app.application.semantic.semantic_runtime_binding_service import SemanticRuntimeBindingService
        from app.infrastructure.repositories.datasource_repository import DatasourceRepository
        from app.extensions import db

        runtime_binding = getattr(semantic_service._definition_service, "_runtime_binding_service", None)
        if runtime_binding is None:
            runtime_binding = SemanticRuntimeBindingService(
                datasource_repository=DatasourceRepository(db.session)
            )
        modeling_service = CubeModelingService(
            cube_repo=semantic_service._cube_repo,
            runtime_binding_service=runtime_binding,
            definition_service=semantic_service._definition_service,
            registry_repo=registry_repo,
            field_candidate_service=field_candidate_service,
        )
    if modeling_source_service is None:
        from app.application.semantic.cube_modeling_source_service import CubeModelingSourceService
        from app.infrastructure.repositories.datasource_repository import DatasourceRepository
        from app.extensions import db

        modeling_source_service = CubeModelingSourceService(
            cube_modeling_service=modeling_service,
            dataset_repository=dataset_repo,
            datasource_repository=DatasourceRepository(db.session),
        )
    if domain_modeling_service is None or domain_canvas_service is None:
        from app.application.semantic.domain_canvas_service import DomainCanvasService
        from app.application.semantic.domain_modeling_service import DomainModelingService
        from app.infrastructure.semantic.yaml_catalog_repository import YamlCatalogRepository
        from app.infrastructure.semantic.yaml_domain_repository import YamlDomainRepository

        domain_repo = YamlDomainRepository(os.path.join(_semantic_base(), "domains"))
        catalog_repo = YamlCatalogRepository(os.path.join(_semantic_base(), "catalogs"))
        if domain_modeling_service is None:
            domain_modeling_service = DomainModelingService(
                domain_repo=domain_repo,
                catalog_repo=catalog_repo,
                cube_repo=semantic_service._cube_repo,
                registry_repo=registry_repo,
                cache_invalidator=semantic_service.invalidate_cache,
            )
        if domain_canvas_service is None:
            domain_canvas_service = DomainCanvasService(
                domain_repo=domain_repo,
                catalog_repo=catalog_repo,
                cube_repo=semantic_service._cube_repo,
                registry_repo=registry_repo,
            )

    def _resolve_query_adapter():
        if query_adapter_getter is None:
            return None, None
        return query_adapter_getter()

    def _resolve_data_asset_repository():
        container = getattr(current_app, "container", None)
        provider = (
            getattr(container, "data_asset_repository", None)
            if container is not None
            else None
        )
        if provider is None:
            return None
        try:
            return provider() if callable(provider) else provider
        except Exception as exc:
            logger.warning("resolve_data_asset_repository_failed", error=str(exc))
            return None

    def _build_schema_sync_service(schema_source=None):
        from app.application.semantic.schema_sync_service import SchemaSyncService
        from app.domain.semantic.ports.schema_inspector import ISchemaInspector

        class _NullInspector(ISchemaInspector):
            def get_table_columns(self, table_name: str):
                return []

            def fetch_dict_enums(self, dict_type: str):
                return None

        runtime_binding_service = getattr(
            semantic_service._definition_service,
            "_runtime_binding_service",
            None,
        )
        if schema_source == "asset_snapshot":
            from app.infrastructure.semantic.asset_snapshot_schema_inspector import (
                AssetSnapshotSchemaInspector,
            )

            repository = _resolve_data_asset_repository()
            inspector = (
                AssetSnapshotSchemaInspector.from_repository(repository)
                if repository is not None
                else _NullInspector()
            )
        else:
            adapter, database = _resolve_query_adapter()
            if adapter is not None:
                from app.infrastructure.semantic.maxcompute_schema_inspector import MaxComputeSchemaInspector
                inspector = MaxComputeSchemaInspector(adapter=adapter, database=database)
            else:
                inspector = _NullInspector()
        return SchemaSyncService(
            cube_repo=semantic_service._cube_repo,
            inspector=inspector,
            view_repo=semantic_service._view_repo,
            registry_repo=registry_repo,
            runtime_binding_service=runtime_binding_service,
        )

    def _build_schema_report(cube_name=None, *, schema_source=None):
        sync_service = _build_schema_sync_service(schema_source=schema_source)
        if cube_name:
            return sync_service.check_cube(cube_name)
        return sync_service.check_all()

    def _resolve_mapper_service():
        if mapper_service is not None:
            return mapper_service
        container = getattr(current_app, "container", None)
        provider = (
            getattr(container, "semantic_mapper_preview_service", None)
            if container is not None
            else None
        )
        if provider is None:
            return None
        try:
            return provider() if callable(provider) else provider
        except Exception as exc:
            logger.warning("resolve_semantic_mapper_service_failed", error=str(exc))
            return None

    def _build_mapper_stale_payload():
        resolved_mapper_service = _resolve_mapper_service()
        stale_check = (
            getattr(resolved_mapper_service, "stale_check", None)
            if resolved_mapper_service is not None
            else None
        )
        if not callable(stale_check):
            return None
        try:
            payload = stale_check()
            return payload if isinstance(payload, dict) else None
        except Exception as exc:
            logger.warning("semantic_mapper_stale_check_failed", error=str(exc))
            return None

    def _build_data_asset_summary_payload():
        container = getattr(current_app, "container", None)
        provider = (
            getattr(container, "data_asset_service", None)
            if container is not None
            else None
        )
        if provider is None:
            return None
        try:
            service = provider() if callable(provider) else provider
            radar_summary = getattr(service, "radar_summary", None)
            return radar_summary() if callable(radar_summary) else None
        except Exception as exc:
            logger.warning("semantic_data_asset_summary_failed", error=str(exc))
            return None

    def _parse_positive_int_arg(name, *, default, maximum=None):
        raw_value = request.args.get(name)
        if raw_value is None or str(raw_value).strip() == "":
            return default
        try:
            parsed = int(raw_value)
        except (TypeError, ValueError):
            return default
        if parsed < 1:
            return default
        if maximum is not None:
            return min(parsed, maximum)
        return parsed

    def _contains_keyword(item, keyword, fields):
        if not keyword:
            return True
        normalized = keyword.strip().lower()
        if not normalized:
            return True
        return any(normalized in str(item.get(field) or "").lower() for field in fields)

    def _contains_domain_join_payload(body):
        return isinstance(body, dict) and "joins" in body

    def _domain_join_payload_error():
        return error(
            "Domain 只作为业务上下文和资产组织，不再接受 joins；执行 Join 请在 Cube.joins 建模，业务关系请在 Ontology Relation 建模"
        )

    def _build_list_payload(items, key, *, default_page_size=20):
        total = len(items)
        pagination_requested = request.args.get("page") is not None or request.args.get("page_size") is not None
        if pagination_requested:
            page = _parse_positive_int_arg("page", default=1)
            page_size = _parse_positive_int_arg("page_size", default=default_page_size, maximum=200)
        else:
            page = 1
            page_size = max(total, 1)
        start = (page - 1) * page_size
        end = start + page_size
        page_count = (total + page_size - 1) // page_size if total else 0
        return {
            key: items[start:end],
            "total": total,
            "page": page,
            "page_size": page_size,
            "page_count": page_count,
        }

    # ── B-back-3: lazy-init view_materialize_service ────────────────────────

    _vmat_svc = view_materialize_service  # may be None; lazy init on first use

    def _get_vmat_service():
        nonlocal _vmat_svc
        if _vmat_svc is None:
            from app.application.semantic.view_materialize_service import ViewMaterializeService
            from app.infrastructure.semantic.view_materialize_repo import ViewMaterializeRepository
            _vmat_svc = ViewMaterializeService(
                repo=ViewMaterializeRepository(),
                semantic_service=semantic_service,
            )
        return _vmat_svc

    # ── B-back-7: lazy-init cube_listing_service ─────────────────────────────

    _cube_listing_svc = cube_listing_service  # may be None; lazy init on first use

    def _get_cube_listing_service():
        nonlocal _cube_listing_svc
        if _cube_listing_svc is None:
            from app.application.semantic.cube_listing_service import CubeListingService
            _cube_listing_svc = CubeListingService(
                semantic_service=semantic_service,
                cube_repo=getattr(semantic_service, "_cube_repo", None),
            )
        return _cube_listing_svc

    # ── B-6: lazy-init domain_publish_history_service ────────────────────────

    _domain_publish_history_svc = None

    def _resolve_domain_publish_history_service():
        nonlocal _domain_publish_history_svc
        if _domain_publish_history_svc is not None:
            return _domain_publish_history_svc
        try:
            from app.application.services.config.domain_publish_history_service import (
                DomainPublishHistoryService,
            )
            from app.extensions import db
            _domain_publish_history_svc = DomainPublishHistoryService(session=db.session)
            return _domain_publish_history_svc
        except Exception as exc:
            logger.warning("init_domain_publish_history_service_failed", error=str(exc))
            return None

    return SimpleNamespace(
        semantic_service=semantic_service,
        dataset_repo=dataset_repo,
        dataset_handler=dataset_handler,
        publish_service=publish_service,
        registry_repo=registry_repo,
        modeling_service=modeling_service,
        modeling_source_service=modeling_source_service,
        domain_modeling_service=domain_modeling_service,
        domain_canvas_service=domain_canvas_service,
        query_adapter_getter=query_adapter_getter,
        runtime_snapshot_service=runtime_snapshot_service,
        mapper_service=mapper_service,
        field_candidate_service=field_candidate_service,
        _resolve_query_adapter=_resolve_query_adapter,
        _resolve_data_asset_repository=_resolve_data_asset_repository,
        _build_schema_sync_service=_build_schema_sync_service,
        _build_schema_report=_build_schema_report,
        _resolve_mapper_service=_resolve_mapper_service,
        _build_mapper_stale_payload=_build_mapper_stale_payload,
        _build_data_asset_summary_payload=_build_data_asset_summary_payload,
        _parse_positive_int_arg=_parse_positive_int_arg,
        _contains_keyword=_contains_keyword,
        _contains_domain_join_payload=_contains_domain_join_payload,
        _domain_join_payload_error=_domain_join_payload_error,
        _build_list_payload=_build_list_payload,
        _get_vmat_service=_get_vmat_service,
        _get_cube_listing_service=_get_cube_listing_service,
        _resolve_domain_publish_history_service=_resolve_domain_publish_history_service,
    )
