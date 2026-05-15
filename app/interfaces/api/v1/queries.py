"""查询中心 REST API。"""
import hashlib
import os
import re
from typing import Any

from flask import Blueprint, request, g, send_file, abort, current_app, jsonify
from pydantic import ValidationError
from app.di.utils import get_app_container
from app.application.access.identity import RoleBindingResolver
from app.application.governance.access import AccessPolicyDecisionService, PrincipalResolver, canonical_sql_hash
from app.interfaces.api.middleware.auth import require_auth
from app.application.query.commands.execute_query import ExecuteQueryCommand
from app.application.query.commands.create_query import CreateQueryCommand
from app.application.query.commands.update_query import UpdateQueryCommand
from app.application.query.commands.submit_export import SubmitExportCommand
from app.application.query.commands.cancel_export import CancelExportCommand
from app.application.query.schemas.query_schemas import (
    ExecuteQueryRequest,
    CreateQueryRequest,
    UpdateQueryRequest,
    CreateFolderRequest
)
from app.application.query.schemas.query_export_schemas import (
    SubmitExportRequest,
    ListExportsRequest,
)
from app.shared.exceptions import (
    ApplicationException,
    AuthorizationError,
    EntityNotFoundError,
    ExportNotCancellableError,
    InvalidSQLError,
    QueryExportNotFoundError,
    QuotaExceededError,
    ValidationError as AppValidationError,
)
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.infrastructure.gateway.telemetry_client import GatewayQueryClient, GatewayQueryError
from app.infrastructure.governance.repositories import SqlAccessGovernanceRepository
from app.shared.response import success, created, error, not_found, server_error
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('queries', __name__, url_prefix='/api/v1/queries')


def get_current_user():
    """获取当前权限主体。

    查询记录的负责人 / 执行人属于授权事实，优先写入新的 Principal ID；
    旧 JWT 只有 user_id 时再兼容回退。
    """
    return g.get('principal_id') or g.get('user_id', 'admin')


def _gateway_query_enabled() -> bool:
    return bool(current_app.config.get("QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN"))


def _gateway_query_client() -> GatewayQueryClient:
    base_url = current_app.config.get("QUERY_GATEWAY_BASE_URL") or "http://dw-query-gateway:8000"
    token = current_app.config.get("QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN")
    timeout = int(current_app.config.get("QUERY_GATEWAY_TIMEOUT_SECONDS") or 5)
    if not token:
        raise GatewayQueryError("未配置 QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN")
    return GatewayQueryClient(
        base_url=base_url,
        platform_service_token=token,
        timeout_seconds=timeout,
    )


def _request_principal():
    principal_id = get_current_user()
    jwt_roles = list(getattr(g, "user_roles", []) or [])
    binding_roles: list[str] = []
    try:
        bound = RoleBindingResolver(SqlAccessRepository(db.session)).resolve_principal_context(
            principal_id=principal_id,
            actor_id=principal_id,
            actor_type="human",
            source="query_execute",
        )
        binding_roles = list(bound.roles or [])
    except Exception:
        logger.debug("查询执行解析 access role binding 失败，回退 JWT roles", exc_info=True)
    roles = _dedupe([*jwt_roles, *binding_roles])
    return PrincipalResolver().resolve(
        principal_context={
            "principal_id": principal_id,
            "display_name": getattr(g, "user_name", None),
            "roles": roles,
            "actor_type": "human",
            "actor_id": principal_id,
            "source": "query_execute",
        },
        authenticated_user=None,
    )


def _dedupe(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _resource_refs_from_sql(sql: str, *, source_id: int) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for match in re.finditer(r"\b(?:FROM|JOIN)\s+([`\"A-Za-z0-9_.]+)", sql or "", flags=re.IGNORECASE):
        token = match.group(1).strip().strip("`\"")
        if not token or token.startswith("("):
            continue
        parts = [part.strip("`\"") for part in token.split(".") if part.strip("`\"")]
        if not parts:
            continue
        table = parts[-1]
        project = parts[-2] if len(parts) >= 2 else ""
        key = (project.lower(), table.lower())
        if key in seen:
            continue
        seen.add(key)
        refs.append(
            {
                "data_source_id": str(source_id),
                "engine": "maxcompute",
                "project": project,
                "schema": "",
                "table": table,
                "columns": [],
            }
        )
    return refs


def _compiled_targets_for_query(schema: ExecuteQueryRequest) -> list[dict[str, Any]]:
    return [
        {
            "target_type": "sql",
            "logical_sql": schema.sql_query,
            "sql_hash": canonical_sql_hash(schema.sql_query),
            "resource_set": {
                "physical": _resource_refs_from_sql(schema.sql_query, source_id=schema.source_id),
            },
            "execution_request": {"source_id": schema.source_id},
        }
    ]


def _decision_id(principal_id: str, sql_hashes: list[str], policy_epoch: int) -> str:
    raw = f"{principal_id}|{policy_epoch}|{','.join(sql_hashes)}"
    return f"pd_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]}"


def _gateway_access_context_from_decision(decision) -> dict[str, Any]:
    preview = dict((decision.execution_permit or {}).get("access_context_preview") or {})
    sql_hashes = list(preview.get("sql_hashes") or decision.sql_hashes or [])
    return {
        "schema": "GatewayAccessContext.v1",
        "principal_id": preview.get("principal_id") or decision.ticket_preview.get("principal_id"),
        "actor_type": preview.get("actor_type") or "human",
        "actor_id": preview.get("actor_id") or preview.get("principal_id"),
        "policy_decision_id": _decision_id(
            str(preview.get("principal_id") or decision.ticket_preview.get("principal_id") or "anonymous"),
            sql_hashes,
            int(preview.get("policy_epoch") or decision.policy_epoch or 1),
        ),
        "policy_version": preview.get("policy_version") or decision.policy_version,
        "policy_epoch": int(preview.get("policy_epoch") or decision.policy_epoch or 1),
        "execution_profile_code": preview.get("execution_profile_code") or decision.execution_profile.get("profile_code"),
        "data_level": preview.get("data_level") or decision.effective_data_level,
        "resource_set_physical": list(preview.get("resource_set_physical") or []),
        "sql_hashes": sql_hashes,
        "constraints": dict(preview.get("constraints") or {}),
    }


def _policy_denied_response(decision):
    return jsonify(
        {
            "code": -1,
            "message": decision.message,
            "data": {"policy_decision": decision.to_dict()},
            "trace_id": getattr(g, "request_id", None) or getattr(g, "trace_id", None),
        }
    ), 400


def _execute_via_gateway(schema: ExecuteQueryRequest):
    principal = _request_principal()
    repository = SqlAccessGovernanceRepository(db.session)
    decision = AccessPolicyDecisionService(policy_repository=repository).post_compile(
        principal=principal,
        compiled_targets=_compiled_targets_for_query(schema),
    )
    if decision.decision != "allow":
        return _policy_denied_response(decision)

    access_context = _gateway_access_context_from_decision(decision)
    gateway_result = _gateway_query_client().execute_sql(
        sql=schema.sql_query,
        access_context=access_context,
        wait_for_completion=False,
    )
    return success(
        data={
            "gateway_query_id": gateway_result.get("query_id"),
            "query_id": gateway_result.get("query_id"),
            "status": gateway_result.get("status"),
            "completed": gateway_result.get("completed"),
            "poll_url": gateway_result.get("poll_url"),
            "result_url": gateway_result.get("result_url"),
            "policy_decision": decision.to_dict(),
        }
    )


# ============================================================================
# 查询执行
# ============================================================================

@bp.route('/execute', methods=['POST'])
@require_auth
def execute_query():
    """执行查询（核心端点）"""
    try:
        schema = ExecuteQueryRequest(**request.json)
        if _gateway_query_enabled():
            return _execute_via_gateway(schema)
        command = ExecuteQueryCommand(
            source_id=schema.source_id,
            sql_query=schema.sql_query,
            query_id=schema.query_id,
            limit=schema.limit,
            executed_by=get_current_user()
        )
        container = get_app_container()
        handler = container.execute_query_handler()
        result = handler.handle(command)
        return success(data=result)
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}') if hasattr(e, 'errors') else error(message=str(e))
    except ApplicationException as e:
        return error(message=str(e))
    except GatewayQueryError as e:
        return error(message=str(e), status=502)
    except Exception as e:
        logger.error(f"Execute query failed: {str(e)}", exc_info=True)
        return server_error(message=f'执行失败: {str(e)}')


# ============================================================================
# 查询 CRUD
# ============================================================================

@bp.route('', methods=['GET'])
@require_auth
def list_queries():
    """查询列表"""
    try:
        container = get_app_container()
        handler = container.list_queries_handler()
        result = handler.handle(
            page=request.args.get('page', 1, type=int),
            page_size=request.args.get('page_size', 20, type=int),
            folder_id=request.args.get('folder_id', type=int),
            is_favorite=request.args.get('is_favorite', type=lambda x: x.lower() == 'true'),
            search=request.args.get('search'),
            created_by=get_current_user()
        )
        return success(data=result)
    except Exception as e:
        logger.error(f"List queries failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取查询列表失败: {str(e)}')


@bp.route('', methods=['POST'])
@require_auth
def create_query():
    """保存查询"""
    try:
        schema = CreateQueryRequest(**request.json)
        command = CreateQueryCommand(
            query_name=schema.query_name,
            source_id=schema.source_id,
            sql_query=schema.sql_query,
            description=schema.description,
            folder_id=schema.folder_id,
            tags=schema.tags,
            is_favorite=schema.is_favorite,
            created_by=get_current_user()
        )
        container = get_app_container()
        handler = container.create_query_handler()
        query = handler.handle(command)
        return created(data={
            'id': query.id,
            'query_code': query.query_code,
            'query_name': query.query_name
        })
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}')
    except (AppValidationError, ApplicationException) as e:
        return error(message=str(e))
    except Exception as e:
        logger.error(f"Create query failed: {str(e)}", exc_info=True)
        return server_error(message=f'创建查询失败: {str(e)}')


@bp.route('/<int:id>', methods=['GET'])
@require_auth
def get_query(id):
    """查询详情"""
    try:
        container = get_app_container()
        handler = container.get_query_handler()
        result = handler.handle(query_id=id)
        return success(data=result)
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Get query failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取查询详情失败: {str(e)}')


@bp.route('/<int:id>', methods=['PUT'])
@require_auth
def update_query(id):
    """更新查询"""
    try:
        schema = UpdateQueryRequest(**request.json)
        command = UpdateQueryCommand(
            query_id=id,
            query_name=schema.query_name,
            sql_query=schema.sql_query,
            description=schema.description,
            folder_id=schema.folder_id,
            tags=schema.tags,
            source_id=schema.source_id
        )
        container = get_app_container()
        handler = container.update_query_handler()
        query = handler.handle(command)
        return success(data={'id': query.id, 'query_name': query.query_name})
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}')
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Update query failed: {str(e)}", exc_info=True)
        return server_error(message=f'更新查询失败: {str(e)}')


@bp.route('/<int:id>', methods=['DELETE'])
@require_auth
def delete_query(id):
    """删除查询"""
    try:
        container = get_app_container()
        handler = container.delete_query_handler()
        handler.handle(query_id=id)
        return success()
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Delete query failed: {str(e)}", exc_info=True)
        return server_error(message=f'删除查询失败: {str(e)}')


# ============================================================================
# 收藏
# ============================================================================

@bp.route('/<int:id>/favorite', methods=['POST'])
@require_auth
def toggle_favorite(id):
    """切换收藏状态"""
    try:
        container = get_app_container()
        handler = container.toggle_favorite_handler()
        result = handler.handle(query_id=id)
        return success(data=result)
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Toggle favorite failed: {str(e)}", exc_info=True)
        return server_error(message=f'操作失败: {str(e)}')


# ============================================================================
# 文件夹
# ============================================================================

@bp.route('/folders', methods=['GET'])
@require_auth
def list_folders():
    """文件夹列表"""
    try:
        container = get_app_container()
        handler = container.list_folders_handler()
        result = handler.handle(created_by=get_current_user())
        return success(data=result)
    except Exception as e:
        logger.error(f"List folders failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取文件夹列表失败: {str(e)}')


@bp.route('/folders', methods=['POST'])
@require_auth
def create_folder():
    """创建文件夹"""
    try:
        schema = CreateFolderRequest(**request.json)
        container = get_app_container()
        handler = container.create_folder_handler()
        result = handler.handle(
            folder_name=schema.folder_name,
            parent_id=schema.parent_id,
            created_by=get_current_user()
        )
        return created(data=result)
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}')
    except Exception as e:
        logger.error(f"Create folder failed: {str(e)}", exc_info=True)
        return server_error(message=f'创建文件夹失败: {str(e)}')


# ============================================================================
# 历史记录
# ============================================================================

@bp.route('/histories', methods=['GET'])
@require_auth
def list_histories():
    """查询历史列表"""
    try:
        container = get_app_container()
        handler = container.list_histories_handler()
        result = handler.handle(
            page=request.args.get('page', 1, type=int),
            page_size=request.args.get('page_size', 20, type=int),
            query_id=request.args.get('query_id', type=int),
            source_id=request.args.get('source_id', type=int),
            status=request.args.get('status'),
            executed_by=get_current_user(),
            date_from=request.args.get('date_from'),
            date_to=request.args.get('date_to')
        )
        return success(data=result)
    except Exception as e:
        logger.error(f"List histories failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取查询历史失败: {str(e)}')


@bp.route('/histories/<int:history_id>', methods=['GET'])
@require_auth
def get_history_detail(history_id: int):
    """查询历史详情（C-1）"""
    try:
        container = get_app_container()
        handler = container.get_history_detail_handler()
        result = handler.handle(history_id=history_id)
        return success(data=result)
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Get history detail failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取查询历史详情失败: {str(e)}')


# ============================================================================
# 统计
# ============================================================================

@bp.route('/statistics', methods=['GET'])
@require_auth
def get_statistics():
    """获取统计数据"""
    try:
        container = get_app_container()
        handler = container.get_statistics_handler()
        result = handler.handle(user_id=get_current_user())
        return success(data=result)
    except Exception as e:
        logger.error(f"Get statistics failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取统计数据失败: {str(e)}')


# ============================================================================
# 查询模板
# ============================================================================

@bp.route('/templates', methods=['GET'])
@require_auth
def list_templates():
    """查询模板列表"""
    try:
        container = get_app_container()
        handler = container.list_templates_handler()
        result = handler.handle(
            page=request.args.get('page', 1, type=int),
            per_page=request.args.get('page_size', 20, type=int),
            category=request.args.get('category'),
            search=request.args.get('search')
        )
        return success(data=result)
    except Exception as e:
        logger.error(f"List templates failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取模板列表失败: {str(e)}')


@bp.route('/templates', methods=['POST'])
@require_auth
def create_template():
    """创建查询模板"""
    try:
        data = request.json
        container = get_app_container()
        handler = container.create_template_handler()
        result = handler.handle(
            template_name=data.get('template_name', ''),
            sql_template=data.get('sql_template', ''),
            template_description=data.get('template_description'),
            parameters=data.get('parameters', []),
            category=data.get('category'),
            tags=data.get('tags', []),
            created_by=get_current_user()
        )
        return created(data=result)
    except (AppValidationError, ApplicationException) as e:
        return error(message=str(e))
    except Exception as e:
        logger.error(f"Create template failed: {str(e)}", exc_info=True)
        return server_error(message=f'创建模板失败: {str(e)}')


@bp.route('/templates/<int:id>', methods=['GET'])
@require_auth
def get_template(id):
    """获取模板详情"""
    try:
        container = get_app_container()
        handler = container.get_template_handler()
        result = handler.handle(template_id=id)
        return success(data=result)
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Get template failed: {str(e)}", exc_info=True)
        return server_error(message=f'获取模板详情失败: {str(e)}')


@bp.route('/templates/<int:id>', methods=['PUT'])
@require_auth
def update_template(id):
    """更新查询模板"""
    try:
        data = request.json
        container = get_app_container()
        handler = container.update_template_handler()
        result = handler.handle(
            template_id=id,
            updated_by=get_current_user(),
            **{k: v for k, v in data.items()
               if k in ('template_name', 'template_description', 'sql_template',
                         'parameters', 'category', 'tags')}
        )
        return success(data=result)
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Update template failed: {str(e)}", exc_info=True)
        return server_error(message=f'更新模板失败: {str(e)}')


@bp.route('/templates/<int:id>', methods=['DELETE'])
@require_auth
def delete_template(id):
    """删除查询模板"""
    try:
        container = get_app_container()
        handler = container.delete_template_handler()
        handler.handle(template_id=id, deleted_by=get_current_user())
        return success()
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Delete template failed: {str(e)}", exc_info=True)
        return server_error(message=f'删除模板失败: {str(e)}')


@bp.route('/templates/<int:id>/use', methods=['POST'])
@require_auth
def use_template(id):
    """使用模板"""
    try:
        container = get_app_container()
        handler = container.use_template_handler()
        result = handler.handle(template_id=id, params=request.json or {})
        return success(data=result)
    except EntityNotFoundError as e:
        return not_found(message=str(e))
    except Exception as e:
        logger.error(f"Use template failed: {str(e)}", exc_info=True)
        return server_error(message=f'使用模板失败: {str(e)}')


# ============================================================================
# 异步数据导出（add-query-export）
# ============================================================================


def _export_error(exc: Exception):
    """把 service 层异常映射到 HTTP 响应。"""
    if isinstance(exc, QueryExportNotFoundError):
        return not_found(message=str(exc))
    if isinstance(exc, QuotaExceededError):
        return error(
            message=str(exc),
            status=429,
            details=exc.details,
        )
    if isinstance(exc, InvalidSQLError):
        return error(message=str(exc), status=400, details=exc.details)
    if isinstance(exc, ExportNotCancellableError):
        return error(message=str(exc), status=409, details=exc.details)
    if isinstance(exc, AuthorizationError):
        return error(message=str(exc), status=403)
    logger.error(f"Query export error: {exc}", exc_info=True)
    return server_error(message=str(exc))


@bp.route('/export', methods=['POST'])
@require_auth
def submit_export():
    """提交异步数据导出任务"""
    try:
        schema = SubmitExportRequest(**(request.json or {}))
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}', status=400)

    command = SubmitExportCommand(
        source_id=schema.source_id,
        sql_query=schema.sql_query,
        user_id=get_current_user(),
        visual_spec=schema.visual_spec,
    )

    try:
        container = get_app_container()
        handler = container.submit_export_handler()
        result = handler.handle(command)
        return success(data=result, message='accepted', status=202)
    except (
        QueryExportNotFoundError,
        QuotaExceededError,
        InvalidSQLError,
        ExportNotCancellableError,
        AuthorizationError,
    ) as exc:
        return _export_error(exc)
    except Exception as exc:  # pragma: no cover - fallback
        return _export_error(exc)


@bp.route('/exports', methods=['GET'])
@require_auth
def list_exports():
    """分页查询当前用户的导出任务"""
    try:
        params = ListExportsRequest(
            page=request.args.get('page', 1, type=int),
            page_size=request.args.get('page_size', 20, type=int),
            status=request.args.get('status'),
        )
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}', status=400)

    try:
        container = get_app_container()
        handler = container.list_exports_handler()
        result = handler.handle(
            user_id=get_current_user(),
            page=params.page,
            page_size=params.page_size,
            status=params.status,
        )
        return success(data=result)
    except Exception as exc:  # pragma: no cover - fallback
        return _export_error(exc)


@bp.route('/exports/<int:export_id>', methods=['GET'])
@require_auth
def get_export(export_id: int):
    """查询单个导出任务（含 file_url）"""
    try:
        container = get_app_container()
        handler = container.get_export_handler()
        result = handler.handle(
            user_id=get_current_user(),
            export_id=export_id,
        )
        return success(data=result)
    except (QueryExportNotFoundError, AuthorizationError) as exc:
        return _export_error(exc)
    except Exception as exc:  # pragma: no cover
        return _export_error(exc)


@bp.route('/exports/<int:export_id>/cancel', methods=['POST'])
@require_auth
def cancel_export(export_id: int):
    """取消导出任务"""
    command = CancelExportCommand(
        export_id=export_id,
        user_id=get_current_user(),
    )
    try:
        container = get_app_container()
        handler = container.cancel_export_handler()
        result = handler.handle(command)
        return success(data=result, status=202)
    except (
        QueryExportNotFoundError,
        ExportNotCancellableError,
        AuthorizationError,
    ) as exc:
        return _export_error(exc)
    except Exception as exc:  # pragma: no cover
        return _export_error(exc)


@bp.route('/exports/<int:export_id>/download', methods=['GET'])
@require_auth
def download_export(export_id: int):
    """本地回落：流式下载导出文件（仅创建人可访问）"""
    container = get_app_container()
    repository = container.query_export_repository()
    export = repository.find_for_user(export_id, get_current_user())
    if not export:
        return _export_error(QueryExportNotFoundError(export_id))

    if export.status != 'success':
        return error(
            message=f"export not ready, current status={export.status}",
            status=409,
        )
    if export.file_storage != 'local':
        return error(
            message='file is served by object storage, use file_url instead',
            status=400,
        )
    if not export.file_object_key or not os.path.exists(export.file_object_key):
        return not_found(message='export file missing or expired')

    logger.info(
        "query export downloaded",
        export_id=export_id,
        user_id=get_current_user(),
    )

    filename = f"export_{export_id}.csv"
    return send_file(
        export.file_object_key,
        mimetype='text/csv; charset=utf-8',
        as_attachment=True,
        download_name=filename,
    )
