"""语义层管理 REST API"""
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from flask import Blueprint, current_app, g, request
from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import success, error, not_found, created
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def _json_scalar(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return None


def _extract_view_cube_name(ref):
    """兼容 ViewCubeRef 和旧测试里的字符串引用。"""
    if isinstance(ref, str):
        return ref.strip() or None
    join_path = getattr(ref, "join_path", None)
    if not isinstance(join_path, str) or not join_path.strip():
        return None
    return join_path.split(">", 1)[0].split(".", 1)[0].strip() or None


def _default_query_adapter_getter():
    from app.executors.schema_drift_executor import SchemaDriftExecutor

    return SchemaDriftExecutor._get_maxcompute_adapter()


def _semantic_base():
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
        "infrastructure", "semantic",
    )


def create_semantic_blueprint(
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
):
    """Blueprint 工厂：依赖在初始化时注入，便于单元测试时传入 Mock。

    Args:
        semantic_service: SemanticLayerService 实例
        publish_service: ViewPublishService 实例
        dataset_repo: IDatasetRepository 实例
        dataset_handler: CreateDatasetHandler 实例
    """
    bp = Blueprint('semantic', __name__, url_prefix='/api/v1/semantic')
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

    def _build_schema_sync_service():
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

    def _build_schema_report(cube_name=None):
        sync_service = _build_schema_sync_service()
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

    @bp.route('/health', methods=['GET'])
    @require_auth
    def semantic_health():
        """语义 Runtime 健康检查"""
        if runtime_snapshot_service is None:
            return success(
                data={
                    "status": "degraded",
                    "runtime": {
                        "manifest_status": "not_configured",
                        "error_code": "semantic_runtime_snapshot_service_not_configured",
                    },
                }
            )
        try:
            manifest = runtime_snapshot_service.get_active_manifest("default")
        except Exception as exc:
            logger.exception("semantic_health_check_failed", error=str(exc))
            return success(
                data={
                    "status": "unhealthy",
                    "runtime": {
                        "manifest_status": "error",
                        "error_code": "semantic_runtime_health_check_failed",
                        "reason": str(exc),
                    },
                }
            )

        runtime_ok = bool(manifest.get("ok"))
        version_pin = manifest.get("version_pin") or {}
        asset_trace = manifest.get("asset_trace") or []
        binding_trace = manifest.get("binding_trace") or {}
        policy_trace = manifest.get("policy_trace") or {}
        return success(
            data={
                "status": "healthy" if runtime_ok else "unhealthy",
                "runtime": {
                    "manifest_status": "ready" if runtime_ok else "blocked",
                    "error_code": manifest.get("error_code"),
                    "version_pin": version_pin,
                    "asset_count": len(asset_trace) if asset_trace else version_pin.get("asset_count", 0),
                    "binding_count": binding_trace.get("count", 0),
                    "policy_count": policy_trace.get("count", 0),
                },
            }
        )

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

    # ── Cubes ──

    @bp.route('/cubes', methods=['GET'])
    @require_auth
    def list_cubes():
        try:
            cubes = _get_cube_listing_service().list_cubes_with_derivatives()
        except Exception:
            cubes = semantic_service.list_cubes()
        keyword = (request.args.get("q") or "").strip()
        filtered = [
            cube for cube in cubes
            if _contains_keyword(cube, keyword, ["name", "title", "description", "domain_name"])
        ]
        filtered.sort(key=lambda item: ((item.get("title") or item.get("name") or "").lower(), item.get("name") or ""))
        return success(data=_build_list_payload(filtered, "cubes"))

    @bp.route('/cubes/<cube_name>', methods=['GET'])
    @require_auth
    def describe_cube(cube_name):
        result = semantic_service.describe_cube(cube_name)
        if "error" in result:
            return not_found(result["error"])
        return success(data=result)

    @bp.route('/cubes/draft-from-source', methods=['POST'])
    @require_admin
    def draft_cube_from_source():
        body = request.get_json(silent=True) or {}
        source_kind = body.get("source_kind")
        if not source_kind:
            return error("请求体缺少必填字段: source_kind")
        try:
            result = modeling_source_service.generate_cube_draft_from_source(
                source_kind=source_kind,
                source_id=body.get("source_id"),
                dataset_id=body.get("dataset_id"),
                database=body.get("database"),
                schema=body.get("schema"),
                table=body.get("table"),
                name=body.get("name"),
                title=body.get("title"),
                description=body.get("description"),
            )
        except Exception as exc:
            return error(f"生成 Cube 草稿失败: {str(exc)}")
        return success(data=result)

    @bp.route('/cubes', methods=['POST'])
    @require_admin
    def create_cube():
        body = request.get_json(silent=True) or {}
        try:
            cube = modeling_service.create_cube(body)
        except Exception as exc:
            return error(f"创建 Cube 失败: {str(exc)}")
        return created(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>', methods=['PUT'])
    @require_admin
    def update_cube(cube_name):
        body = request.get_json(silent=True) or {}
        try:
            cube = modeling_service.update_cube(cube_name, body)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"更新 Cube 失败: {str(exc)}")
        return success(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/activate', methods=['POST'])
    @require_admin
    def activate_cube(cube_name):
        try:
            cube = modeling_service.activate_cube(cube_name)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"激活 Cube 失败: {str(exc)}")
        return success(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/revisions', methods=['POST'])
    @require_admin
    def create_cube_revision(cube_name):
        try:
            cube = modeling_service.create_revision_draft(cube_name)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"发起修订失败: {str(exc)}")
        return created(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/deprecate', methods=['POST'])
    @require_admin
    def deprecate_cube(cube_name):
        try:
            cube = modeling_service.deprecate_cube(cube_name)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"弃用 Cube 失败: {str(exc)}")
        return success(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/validate-fields', methods=['POST'])
    @require_auth
    def validate_cube_fields(cube_name):
        """
        字段级校验（B-4）

        返回: ``{ ok: bool, issues: [{ field, code, message, severity }] }``
        """
        cube = semantic_service._cube_repo.get(cube_name)
        if cube is None:
            return not_found(f"未找到 Cube: {cube_name}")

        diagnostics = semantic_service.validate_cube(cube) or []

        level_to_severity = {
            "error": "error",
            "warn": "warning",
            "warning": "warning",
            "info": "info",
            "ok": "info",
        }

        issues = []
        for item in diagnostics:
            level = (item.get("level") or "info").lower()
            if level == "ok":
                continue
            issues.append({
                "field": item.get("field") or cube_name,
                "code": item.get("kind") or "VALIDATION",
                "message": item.get("message") or "",
                "severity": level_to_severity.get(level, "info"),
            })

        has_error = any(issue["severity"] == "error" for issue in issues)
        return success(data={"ok": not has_error, "issues": issues})

    @bp.route('/metrics/dry-run', methods=['POST'])
    @require_auth
    def dry_run_metric():
        """
        指标公式 dry-run（B-5）

        请求体: ``{ name: str, formula: str }``
        响应: ``{ sql_preview: str, sample_rows: [], errors: [] }``

        实现说明：
        - 当前不执行真实查询，只做最小可用的 SQL 预览合成。
        - 如传入 measures 可识别，则用 ``semantic_service.compile_query`` 编译；
          否则基于 formula 生成轻量包装 SQL，并附上 diagnostics。
        """
        body = request.get_json(silent=True) or {}
        name = (body.get("name") or "").strip()
        formula = (body.get("formula") or "").strip()

        errors = []
        if not formula:
            errors.append({"code": "EMPTY_FORMULA", "message": "公式不能为空"})
            return success(data={"sql_preview": "", "sample_rows": [], "errors": errors})

        sql_preview: str = ""
        sample_rows: list = []

        # 1) 若 name 存在且能解析为某个 cube.measure —— 用编译器生成 SQL
        compiled = False
        try:
            all_cubes = semantic_service._cube_repo.list_all()
            matched_cube = None
            measure_name = name
            for cube in all_cubes:
                if name in (cube.measures or {}):
                    matched_cube = cube
                    break

            if matched_cube is not None:
                dsl = {
                    "cube": matched_cube.name,
                    "measures": [measure_name],
                    "limit": 10,
                }
                compile_result = semantic_service.compile_query(dsl)
                sql_preview = compile_result.sql
                compiled = True
        except Exception as exc:
            errors.append({
                "code": "COMPILE_FAILED",
                "message": f"编译指标失败: {exc}",
            })

        # 2) 兜底：如果无法编译，合成一个"把 formula 包装为 SELECT" 的预览
        if not compiled:
            safe_formula = formula.replace("\n", " ").strip()
            sql_preview = (
                f"-- dry-run preview for metric: {name or '(anonymous)'}\n"
                f"SELECT ({safe_formula}) AS metric_value\n"
                f"FROM <cube>\n"
                f"LIMIT 10;"
            )

        return success(data={
            "sql_preview": sql_preview,
            "sample_rows": sample_rows,
            "errors": errors,
        })

    # ── Domains ──

    @bp.route('/domains', methods=['GET'])
    @require_auth
    def list_domains():
        domains = domain_modeling_service.list_domains()
        keyword = (request.args.get("q") or "").strip()
        catalog_code = (request.args.get("catalog_code") or "").strip()
        filtered = domains
        if catalog_code:
            filtered = [
                domain for domain in filtered
                if (domain.get("catalog_code") or domain_modeling_service.DEFAULT_CATALOG_CODE) == catalog_code
            ]
        filtered = [
            domain for domain in filtered
            if _contains_keyword(domain, keyword, ["name", "code", "description", "catalog_name"])
        ]
        filtered.sort(key=lambda item: ((item.get("name") or item.get("code") or "").lower(), item.get("code") or ""))
        return success(data=_build_list_payload(filtered, "domains"))

    @bp.route('/catalogs', methods=['GET'])
    @require_auth
    def list_catalogs():
        catalogs = domain_modeling_service.list_catalogs()
        return success(data={"catalogs": catalogs, "total": len(catalogs)})

    @bp.route('/catalogs', methods=['POST'])
    @require_admin
    def create_catalog():
        body = request.get_json(silent=True) or {}
        try:
            catalog = domain_modeling_service.create_catalog(body)
        except Exception as exc:
            return error(f"创建目录失败: {str(exc)}")
        return created(data=catalog.model_dump(mode="json"))

    @bp.route('/catalogs/<catalog_code>', methods=['PUT'])
    @require_admin
    def update_catalog(catalog_code):
        body = request.get_json(silent=True) or {}
        try:
            catalog = domain_modeling_service.update_catalog(catalog_code, body)
        except Exception as exc:
            if "未找到目录" in str(exc):
                return not_found(str(exc))
            return error(f"更新目录失败: {str(exc)}")
        return success(data=catalog.model_dump(mode="json"))

    @bp.route('/catalogs/<catalog_code>', methods=['DELETE'])
    @require_admin
    def delete_catalog(catalog_code):
        try:
            domain_modeling_service.delete_catalog(catalog_code)
        except Exception as exc:
            if "未找到目录" in str(exc):
                return not_found(str(exc))
            return error(f"删除目录失败: {str(exc)}")
        return success(data={"code": catalog_code})

    @bp.route('/domains', methods=['POST'])
    @require_admin
    def create_domain():
        body = request.get_json(silent=True) or {}
        if _contains_domain_join_payload(body):
            return _domain_join_payload_error()
        try:
            domain = domain_modeling_service.create_domain(body)
        except Exception as exc:
            return error(f"创建领域失败: {str(exc)}")
        return created(data=domain_modeling_service.get_domain_detail(domain.id or domain.code))

    @bp.route('/domains/<domain_id>', methods=['GET'])
    @require_auth
    def describe_domain(domain_id):
        try:
            domain = domain_modeling_service.get_domain_detail(domain_id)
        except Exception as exc:
            return not_found(str(exc))
        return success(data=domain)

    @bp.route('/domains/<domain_id>', methods=['PUT'])
    @require_admin
    def update_domain(domain_id):
        body = request.get_json(silent=True) or {}
        if _contains_domain_join_payload(body):
            return _domain_join_payload_error()
        try:
            domain = domain_modeling_service.update_domain(domain_id, body)
        except Exception as exc:
            return error(f"更新领域失败: {str(exc)}")
        return success(data=domain_modeling_service.get_domain_detail(domain.id or domain.code))

    @bp.route('/domains/<domain_id>/canvas', methods=['GET'])
    @require_auth
    def get_domain_canvas(domain_id):
        try:
            result = domain_canvas_service.get_canvas(domain_id)
        except Exception as exc:
            return not_found(str(exc))
        return success(data=result)

    @bp.route('/domains/<domain_id>/context-preview', methods=['POST'])
    @require_auth
    def get_domain_context_preview(domain_id):
        try:
            result = domain_modeling_service.get_domain_context_preview(domain_id)
        except Exception as exc:
            return not_found(str(exc))
        return success(data=result)

    @bp.route('/domains/<domain_id>/cubes', methods=['POST'])
    @require_admin
    def add_cube_to_domain(domain_id):
        body = request.get_json(silent=True) or {}
        cube_name = body.get("cube_name")
        if not cube_name:
            return error("请求体必须包含 cube_name")
        try:
            domain = domain_modeling_service.add_cube(domain_id, cube_name)
        except Exception as exc:
            return error(f"添加 Cube 失败: {str(exc)}")
        return success(data=domain_modeling_service.get_domain_detail(domain.id or domain.code))

    @bp.route('/domains/<domain_id>/publish', methods=['POST'])
    @require_admin
    def publish_domain(domain_id):
        body = request.get_json(silent=True) or {}
        if _contains_domain_join_payload(body):
            return _domain_join_payload_error()

        history_service = _resolve_domain_publish_history_service()
        prev_snapshot: Optional[Dict[str, Any]] = None
        if history_service is not None:
            try:
                prev = domain_modeling_service.get_domain_detail(domain_id)
                if isinstance(prev, dict):
                    prev_snapshot = {
                        "cubes": prev.get("cubes") or [],
                    }
            except Exception:
                prev_snapshot = None

        try:
            domain = domain_modeling_service.publish_domain(
                domain_id,
                cubes=body.get("cubes"),
            )
        except Exception as exc:
            if history_service is not None:
                try:
                    history_service.record_publish(
                        domain_id=domain_id,
                        domain_code=None,
                        snapshot={"error": str(exc)},
                        published_by=g.get("user_id"),
                        note=body.get("note"),
                        status="failed",
                        diff_summary=str(exc)[:200],
                    )
                except Exception:
                    pass
            return error(f"发布领域失败: {str(exc)}")

        detail = domain_modeling_service.get_domain_detail(domain.id or domain.code)

        if history_service is not None:
            try:
                next_snapshot = {
                    "cubes": detail.get("cubes") or [] if isinstance(detail, dict) else [],
                }
                history_service.record_publish(
                    domain_id=str(domain.id or domain.code),
                    domain_code=domain.code,
                    snapshot=next_snapshot,
                    published_by=g.get("user_id"),
                    note=body.get("note"),
                    diff_summary=history_service.compute_diff_summary(
                        prev_snapshot, next_snapshot,
                    ),
                    status="success",
                )
            except Exception:
                pass

        return success(data=detail)

    @bp.route('/domains/<domain_id>/publish/history', methods=['GET'])
    @require_auth
    def get_domain_publish_history(domain_id):
        """
        领域发布历史（B-6）

        响应: ``{ records: [{ version, published_at, published_by, status, ... }], total }``
        """
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 20, type=int)

        history_service = _resolve_domain_publish_history_service()
        if history_service is None:
            return success(data={"records": [], "total": 0})

        try:
            result = history_service.list_publish_records(
                domain_id=domain_id, page=page, page_size=page_size,
            )
        except Exception as exc:
            logger.warning("list_domain_publish_history_failed", error=str(exc))
            return success(data={"records": [], "total": 0})
        return success(data=result)

    # ── Views ──

    @bp.route('/views', methods=['GET'])
    @require_auth
    def list_views():
        include_private = request.args.get("include_private", "").lower() == "true"
        keyword = (request.args.get("q") or "").strip()
        list_view_summaries = getattr(semantic_service, "list_view_summaries", None)
        candidate = list_view_summaries(public_only=not include_private) if callable(list_view_summaries) else None
        if isinstance(candidate, list):
            data = candidate
        else:
            views = semantic_service.list_views(public_only=not include_private)
            data = [
                {
                    "name": v.name,
                    "title": v.title,
                    "description": v.description or "",
                    "public": v.public,
                    "cube_count": len(v.cubes),
                    "cubes": [
                        cube_name
                        for ref in v.cubes
                        for cube_name in [_extract_view_cube_name(ref)]
                        if cube_name
                    ],
                }
                for v in views
            ]
        filtered = [
            view for view in data
            if _contains_keyword(view, keyword, ["name", "title", "description"])
        ]
        filtered.sort(key=lambda item: ((item.get("title") or item.get("name") or "").lower(), item.get("name") or ""))
        return success(data=_build_list_payload(filtered, "views"))

    @bp.route('/views/<view_name>', methods=['GET'])
    @require_auth
    def describe_view(view_name):
        include_private = request.args.get("include_private", "").lower() == "true"
        result = semantic_service.describe_view(view_name, include_private=include_private)
        if "error" in result:
            return not_found(result["error"])
        # B-back-3: 附加物化状态字段
        view_id = result.get("id")
        if view_id is not None:
            try:
                extra = _get_vmat_service().get_view_extra_fields(view_id)
                result = {**result, **extra}
            except Exception:
                result.setdefault("materialized_at", None)
                result.setdefault("materialize_status", "idle")
        else:
            result.setdefault("materialized_at", None)
            result.setdefault("materialize_status", "idle")
        return success(data=result)

    # B-back-3: 异步触发物化
    @bp.route('/views/<int:view_id>/materialize', methods=['POST'])
    @require_admin
    def trigger_view_materialize(view_id):
        """POST /api/v1/semantic/views/:id/materialize — 异步触发，立即返回 run_id。"""
        try:
            result = _get_vmat_service().trigger(view_id)
        except Exception as exc:
            logger.error("trigger_materialize_failed", view_id=view_id, error=str(exc))
            return error(f"触发物化失败: {exc}")
        return created(data=result)

    # B-back-3: 物化运行历史
    @bp.route('/views/<int:view_id>/materialize/runs', methods=['GET'])
    @require_auth
    def list_view_materialize_runs(view_id):
        """GET /api/v1/semantic/views/:id/materialize/runs?page=&page_size="""
        page = _parse_positive_int_arg("page", default=1)
        page_size = _parse_positive_int_arg("page_size", default=20, maximum=200)
        try:
            result = _get_vmat_service().get_runs(view_id, page=page, page_size=page_size)
        except Exception as exc:
            return error(f"查询物化历史失败: {exc}")
        return success(data=result)

    @bp.route('/views/<view_name>/materialize', methods=['POST'])
    @require_admin
    def materialize_view(view_name):
        """兼容旧路由：按名称触发 View 发布（非 ID 版本）。"""
        try:
            body = request.get_json(silent=True) or {}
            result = publish_service.publish_view(view_name, source_id=body.get("source_id"))
        except Exception as e:
            if "未找到 View" in str(e):
                return not_found(str(e))
            logger.error("materialize_failed", view=view_name, error=str(e))
            return error(f"发布虚拟数据集失败: {str(e)}")

        if result.get("action") == "created":
            return created(data=result)
        return success(data=result)

    @bp.route('/views/<view_name>/materialize-status', methods=['GET'])
    @require_auth
    def materialize_status(view_name):
        """查询某个 View 的逻辑发布状态。"""
        return success(data=publish_service.get_publish_status(view_name))

    @bp.route('/views/materialize-status', methods=['GET'])
    @require_auth
    def batch_materialize_status():
        """批量查询所有 View 的逻辑发布状态（前端列表页使用）。"""
        include_private = request.args.get("include_private", "").lower() == "true"
        return success(data=publish_service.get_batch_publish_status(public_only=not include_private))

    # ── Recipes ──

    @bp.route('/recipes', methods=['GET'])
    @require_auth
    def list_recipes():
        list_recipe_summaries = getattr(semantic_service, "list_recipe_summaries", None)
        candidate = list_recipe_summaries() if callable(list_recipe_summaries) else None
        if isinstance(candidate, list):
            data = candidate
        else:
            recipes = semantic_service._recipe_repo.list_all()
            data = [
                {
                    "name": r.name,
                    "title": r.title,
                    "tags": r.tags,
                    "example_count": len(r.examples),
                    "related_cubes": list(r.extract_cube_names()),
                }
                for r in recipes
            ]
        return success(data={"recipes": data, "total": len(data)})

    # ── DSL 编译预览 ──

    @bp.route('/compile', methods=['POST'])
    @require_auth
    def compile_dsl():
        body = request.get_json(silent=True)
        if not body or "dsl" not in body:
            return error("请求体必须包含 'dsl' 字段")

        try:
            result = semantic_service.compile_query(body["dsl"])
            return success(data={
                "sql": result.sql,
                "primary_cube": result.primary_cube,
                "joined_cubes": result.joined_cubes,
            })
        except Exception as e:
            return error(f"编译失败: {str(e)}")

    @bp.route('/query', methods=['POST'])
    @require_auth
    def query_dsl():
        body = request.get_json(silent=True)
        if not body or "dsl" not in body:
            return error("请求体必须包含 'dsl' 字段")

        adapter, _database = _resolve_query_adapter()
        result = semantic_service.query(body["dsl"], adapter=adapter)
        if "error" in result:
            return error(result["error"], details=result)
        return success(data=result)

    # ── 关系图 ──

    @bp.route('/graph', methods=['GET'])
    @require_auth
    def get_graph():
        """返回关系图数据（nodes + edges），供 React Flow 渲染"""
        cube_summaries = {
            item["name"]: item
            for item in semantic_service.list_cubes()
        }
        cubes = semantic_service._cube_repo.list_all()

        nodes = []
        edges = []
        for cube in cubes:
            is_fact = len(cube.measures) > 2
            summary = cube_summaries.get(cube.name, {})
            state_summary = summary.get("state_summary", {}) if isinstance(summary, dict) else {}
            if not isinstance(state_summary, dict):
                state_summary = {}
            nodes.append({
                "id": cube.name,
                "title": cube.title,
                "type": "fact" if is_fact else "dimension",
                "dimensions": len(cube.dimensions),
                "measures": len(cube.measures),
                "status": _json_scalar(getattr(cube, "status", None)),
                "source_id": _json_scalar(getattr(cube, "source_id", None)),
                "source_database": _json_scalar(getattr(cube, "source_database", None)),
                "source_schema": _json_scalar(getattr(cube, "source_schema", None)),
                "source_binding_summary": state_summary.get("source_binding_summary"),
                "state_summary": state_summary,
            })
            for alias, j in cube.joins.items():
                edges.append({
                    "source": cube.name,
                    "target": j.cube,
                    "relationship": getattr(j, 'relationship', 'N:1'),
                    "join_type": j.type,
                    "sql": j.sql.replace("{CUBE}", cube.name).replace(f"{{{j.cube}}}", j.cube),
                })

        return success(data={"nodes": nodes, "edges": edges})

    # ── 文件管理 ──

    @bp.route('/files', methods=['GET'])
    @require_auth
    def list_files():
        """列出所有 Cube/View YAML 文件"""
        base = _semantic_base()
        result = {"cubes": [], "views": [], "recipes": [], "domains": []}
        for kind in ("cubes", "views", "recipes", "domains"):
            kind_dir = os.path.join(base, kind)
            if os.path.isdir(kind_dir):
                for f in sorted(os.listdir(kind_dir)):
                    if f.endswith(('.yml', '.yaml')):
                        name = f.rsplit('.', 1)[0]
                        if kind == "domains" and name.startswith("domain_"):
                            name = name[len("domain_"):]
                        result[kind].append(name)
        return success(data=result)

    @bp.route('/files/<file_type>/<name>', methods=['GET'])
    @require_auth
    def read_file(file_type, name):
        """读取 YAML 文件原始内容"""
        if file_type not in ('cubes', 'views', 'recipes', 'domains'):
            return error(f"不支持的文件类型: {file_type}")

        base = _semantic_base()
        filename = f"domain_{name}.yml" if file_type == "domains" else f"{name}.yml"
        fpath = os.path.join(base, file_type, filename)
        if not os.path.isfile(fpath):
            alt_name = f"domain_{name}.yaml" if file_type == "domains" else f"{name}.yaml"
            fpath = os.path.join(base, file_type, alt_name)
        if not os.path.isfile(fpath):
            return not_found(f"文件不存在: {file_type}/{name}")

        with open(fpath, 'r', encoding='utf-8') as fp:
            content = fp.read()
        return success(data={"name": name, "type": file_type, "content": content})

    @bp.route('/files/<file_type>/<name>', methods=['PUT'])
    @require_admin
    def write_file(file_type, name):
        """更新 YAML 文件"""
        if file_type not in ('cubes', 'views', 'recipes', 'domains'):
            return error(f"不支持的文件类型: {file_type}")

        body = request.get_json(silent=True)
        if not body or "content" not in body:
            return error("请求体必须包含 'content' 字段")

        base = _semantic_base()
        filename = f"domain_{name}.yml" if file_type == "domains" else f"{name}.yml"
        fpath = os.path.join(base, file_type, filename)

        try:
            import yaml
            yaml.safe_load(body["content"])
        except Exception as e:
            return error(f"YAML 语法错误: {str(e)}")

        with open(fpath, 'w', encoding='utf-8') as fp:
            fp.write(body["content"])

        semantic_service.invalidate_cache()
        if file_type == "domains":
            domain_modeling_service._domain_repo.reload()

        return success(data={"message": f"已保存 {file_type}/{filename}"})

    @bp.route('/files/<file_type>/<name>/validate', methods=['POST'])
    @require_auth
    def validate_file(file_type, name):
        """校验 YAML 内容合法性"""
        body = request.get_json(silent=True)
        if not body or "content" not in body:
            return error("请求体必须包含 'content' 字段")

        diagnostics = []
        try:
            import yaml
            parsed = yaml.safe_load(body["content"])
            diagnostics.append({"level": "ok", "message": "YAML 语法正确"})

            if file_type == "cubes":
                from app.domain.semantic.entities import CubeDefinition
                cube = CubeDefinition(**parsed)
                diagnostics.append({"level": "ok", "message": "Cube Schema 校验通过"})
                diagnostics.extend(semantic_service.validate_cube(cube))
            elif file_type == "views":
                from app.domain.semantic.entities import ViewDefinition
                view = ViewDefinition(**parsed)
                diagnostics.append({"level": "ok", "message": "View Schema 校验通过"})
                diagnostics.extend(semantic_service.validate_view(view))
            elif file_type == "domains":
                from app.domain.semantic.entities import DomainDefinition
                domain = DomainDefinition(**parsed)
                diagnostics.append({"level": "ok", "message": "Domain Schema 校验通过"})
                diagnostics.extend(domain_modeling_service.validate_domain(domain))
        except Exception as e:
            diagnostics.append({"level": "error", "message": str(e)})

        has_error = any(d["level"] == "error" for d in diagnostics)
        return success(data={"valid": not has_error, "diagnostics": diagnostics})

    # ── Schema Sync ──

    @bp.route('/governance/issues', methods=['GET'])
    @require_admin
    def governance_issues():
        """返回语义治理问题聚合结果。"""
        cube_name = (request.args.get("cube_name") or "").strip() or None
        from app.application.semantic.governance_issue_service import SemanticGovernanceIssueService

        schema_report = _build_schema_report(cube_name)
        mapper_stale_payload = _build_mapper_stale_payload()
        payload = SemanticGovernanceIssueService().build_payload(
            schema_report=schema_report,
            mapper_stale_payload=mapper_stale_payload,
        )
        return success(data=payload)

    @bp.route('/schema-sync', methods=['POST'])
    @require_admin
    def schema_sync():
        """触发 Schema Drift 检测 + 可选飞书 webhook 通知

        Body:
            cube_name (str, optional): 仅检测指定 Cube
            notify (bool): 是否推送飞书通知
            webhook_url (str): 飞书 Webhook 地址（notify=true 时必填）
        """
        body = request.get_json(silent=True) or {}
        cube_name = body.get("cube_name")
        notify = body.get("notify", False)
        webhook_url = body.get("webhook_url", "")

        report = _build_schema_report(cube_name)

        report_dict = report.to_dict()
        report_dict["checked_at"] = datetime.now(timezone.utc).isoformat()

        if notify and report.has_drifts and webhook_url:
            from app.infrastructure.notification.feishu_webhook import FeishuWebhookNotifier
            notifier = FeishuWebhookNotifier(webhook_url=webhook_url)
            notifier.send_schema_drift_report(
                total_cubes=report_dict["total_cubes"],
                checked_cubes=report_dict["checked_cubes"],
                skipped_cubes=report_dict["skipped_cubes"],
                drifts=report_dict["drifts"],
            )
            report_dict["notified"] = True

        return success(data=report_dict)

    # ── B-back-9: Diagnose + DiagnoseRuns ────────────────────────────────────
    # 导入实体确保 SQLAlchemy 元数据注册
    from app.domain.semantic.diagnose_run import DiagnoseRun  # noqa

    @bp.route('/diagnose', methods=['POST'])
    @require_auth
    def diagnose():
        """
        POST /api/v1/semantic/diagnose — 同步诊断并落库（B-back-9）

        Body:
            input_kind (str): nl | sql | yaml
            input_text (str): 诊断内容
        """
        from flask import g
        from app.application.semantic.diagnose_run_service import DiagnoseRunService

        body = request.get_json(silent=True) or {}
        input_kind = body.get('input_kind', 'sql')
        input_text = body.get('input_text', '')

        if not input_text:
            return error('input_text 不能为空')

        user_id = g.get('user_id', 0)
        svc = DiagnoseRunService(semantic_service=semantic_service)
        try:
            result = svc.diagnose_and_record(
                user_id=user_id,
                input_kind=input_kind,
                input_text=input_text,
            )
            return success(data=result)
        except ValueError as exc:
            return error(str(exc))
        except Exception as exc:
            logger.error(f"diagnose failed: {exc}", exc_info=True)
            return error(f'诊断失败: {exc}', status=500)

    @bp.route('/diagnose/runs', methods=['GET'])
    @require_auth
    def list_diagnose_runs():
        """GET /api/v1/semantic/diagnose/runs — 分页列表（B-back-9）"""
        from flask import g
        from app.application.semantic.diagnose_run_service import DiagnoseRunService

        user_id = g.get('user_id', None)
        svc = DiagnoseRunService()
        try:
            result = svc.list(
                user_id=user_id,
                page=request.args.get('page', 1, type=int),
                page_size=request.args.get('page_size', 20, type=int),
            )
            return success(data=result)
        except Exception as exc:
            logger.error(f"list_diagnose_runs failed: {exc}", exc_info=True)
            return error(f'获取诊断历史失败: {exc}', status=500)

    @bp.route('/diagnose/runs/<int:run_id>', methods=['GET'])
    @require_auth
    def get_diagnose_run(run_id):
        """GET /api/v1/semantic/diagnose/runs/:id — 详情（B-back-9）"""
        from app.application.semantic.diagnose_run_service import DiagnoseRunService
        from app.shared.exceptions import EntityNotFoundError

        svc = DiagnoseRunService()
        try:
            result = svc.get(run_id)
            return success(data=result)
        except EntityNotFoundError as exc:
            return not_found(message=str(exc))
        except Exception as exc:
            logger.error(f"get_diagnose_run failed: {exc}", exc_info=True)
            return error(f'获取诊断详情失败: {exc}', status=500)

    return bp
