"""查询中心 REST API。"""
import os

from flask import Blueprint, request, g, send_file, abort, current_app, jsonify
from pydantic import ValidationError
from app.di.utils import get_app_container
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


def _principal_id_from_request(requested_principal_id: str | None = None) -> str:
    """解析本次请求的有效 Principal。

    查询工作台可以携带 prefill 中的 principal_id 作为显式主体意图；
    后端只接受它与认证主体一致，避免通过请求体代执行其他 Principal。
    """
    current_principal_id = str(get_current_user())
    requested = str(requested_principal_id or "").strip()
    if requested and requested != current_principal_id:
        raise AuthorizationError("请求主体与当前认证主体不一致，不能代执行其他 Principal")
    return current_principal_id


# ============================================================================
# 查询执行
# ============================================================================

@bp.route('/execute', methods=['POST'])
@require_auth
def execute_query():
    """执行查询工作台 / SQL Lab 查询。

    该入口只面向交互式查询体验，继续走 DataSource Adapter SPI。
    正式用户 / Agent 发起、需要审计和治理的数仓查询必须通过 dw-query-gateway。
    """
    try:
        schema = ExecuteQueryRequest(**request.json)
        executed_by = _principal_id_from_request(schema.principal_id)
        command = ExecuteQueryCommand(
            source_id=schema.source_id,
            sql_query=schema.sql_query,
            query_id=schema.query_id,
            limit=schema.limit,
            executed_by=executed_by
        )
        container = get_app_container()
        handler = container.execute_query_handler()
        result = handler.handle(command)
        return success(data=result)
    except ValidationError as e:
        return error(message=f'请求参数错误: {e.errors()}') if hasattr(e, 'errors') else error(message=str(e))
    except AuthorizationError as e:
        return error(message=str(e), status=403)
    except ApplicationException as e:
        return error(message=str(e))
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
        created_by = _principal_id_from_request(schema.principal_id)
        command = CreateQueryCommand(
            query_name=schema.query_name,
            source_id=schema.source_id,
            sql_query=schema.sql_query,
            description=schema.description,
            folder_id=schema.folder_id,
            tags=schema.tags,
            is_favorite=schema.is_favorite,
            created_by=created_by
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
    except AuthorizationError as e:
        return error(message=str(e), status=403)
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
