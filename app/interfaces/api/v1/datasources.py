"""
数据源管理 REST API（新架构）
"""

from flask import Blueprint, request, g
from pydantic import ValidationError as PydanticValidationError
from app.application.access.display_names import PrincipalDisplayNameResolver
from app.application.datasource.commands.create_datasource import CreateDatasourceCommand
from app.application.datasource.commands.update_datasource import UpdateDatasourceCommand
from app.application.datasource.commands.delete_datasource import DeleteDatasourceCommand
from app.application.datasource.queries.list_datasources import ListDatasourcesQuery
from app.application.datasource.queries.get_datasource import GetDatasourceQuery
from app.application.datasource.queries.test_connection import TestConnectionQuery
from app.application.datasource.queries.get_databases import GetDatabasesQuery
from app.application.datasource.queries.get_tables import GetTablesQuery
from app.application.datasource.queries.get_schemas import GetSchemasQuery
from app.application.datasource.queries.get_table_schema import GetTableSchemaQuery
from app.application.datasource.queries.get_statistics import GetStatisticsQuery
from app.application.datasource.queries.preview_table_data import PreviewTableDataQuery
from app.application.datasource.schemas.datasource_schemas import (
    CreateDatasourceRequest,
    UpdateDatasourceRequest
)
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, created, bad_request
from app.shared.utils.logger import get_logger
from app.di.utils import get_app_container
from app.infrastructure.tasks.jobs.datasource_catalog_sync_job import execute_datasource_catalog_sync_job

logger = get_logger(__name__)

# 创建 Blueprint
bp = Blueprint('datasources_api_v1', __name__, url_prefix='/api/v1/data-center/datasources')


def _should_auto_sync_catalog(source_type: str) -> bool:
    return source_type in {'postgresql', 'maxcompute'}


def _enqueue_catalog_sync(datasource_id: int) -> str | None:
    """投递目录同步任务，失败时返回 None，由调用方决定是否降级。"""
    container = get_app_container()
    try:
        job = container.task_queue().enqueue(
            execute_datasource_catalog_sync_job,
            datasource_id,
            job_timeout=1800,
            result_ttl=86400,
            failure_ttl=604800,
        )
        return job.id
    except Exception:
        logger.warning("enqueue_datasource_catalog_sync_failed", datasource_id=datasource_id, exc_info=True)
        return None


def _get_datasource_or_raise(datasource_id: int):
    """复用现有查询处理器校验数据源存在性。"""
    container = get_app_container()
    handler = container.get_datasource_handler()
    return handler.handle(GetDatasourceQuery(datasource_id=datasource_id))


def _access_repo() -> SqlAccessRepository:
    return SqlAccessRepository(db.session)


def _decorate_created_by_display_names(items: list[dict]) -> list[dict]:
    """补充创建人展示名，避免业务页面裸显 Feishu 技术主键。"""
    created_by_values = [
        str(item.get('created_by') or '').strip()
        for item in items
        if str(item.get('created_by') or '').strip()
    ]
    names = PrincipalDisplayNameResolver(_access_repo()).resolve_many(created_by_values)

    current_principal_id = getattr(g, 'principal_id', None) or getattr(g, 'user_id', None)
    current_display_name = getattr(g, 'user_name', None)
    if current_principal_id and current_display_name:
        names.setdefault(str(current_principal_id), str(current_display_name))

    for item in items:
        created_by_value = str(item.get('created_by') or '').strip()
        item['created_by_display_name'] = names.get(created_by_value) if created_by_value else None
    return items


def _datasource_payload(datasource, *, mask_sensitive: bool = True) -> dict:
    return _decorate_created_by_display_names([datasource.to_dict(mask_sensitive=mask_sensitive)])[0]


# ============================================================================
# 数据源管理 API
# ============================================================================

@bp.route('', methods=['GET'])
@require_auth
def list_datasources():
    """
    获取数据源列表
    
    Query Parameters:
        - source_type: 数据源类型筛选
        - is_active: 活跃状态筛选 (true/false)
        - search: 搜索关键词
        - page: 页码 (默认1)
        - page_size: 每页数量 (默认20)
    
    Returns:
        200: 数据源列表
        500: 服务器错误
    """
    # 1. 解析查询参数
    source_type = request.args.get('source_type')
    is_active_str = request.args.get('is_active')
    is_active = is_active_str.lower() == 'true' if is_active_str else None
    search = request.args.get('search')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    
    # 2. 构建查询
    query = ListDatasourcesQuery(
        source_type=source_type,
        is_active=is_active,
        search=search,
        page=page,
        page_size=page_size
    )
    
    # 3. 获取处理器（依赖注入）
    container = get_app_container()
    handler = container.list_datasources_handler()
    
    # 4. 执行查询
    result = handler.handle(query)
    
    # 5. 序列化响应
    items = _decorate_created_by_display_names([ds.to_dict(mask_sensitive=True) for ds in result['items']])
    
    return success(data={
        'items': items,
        'total': result['total'],
        'page': result['page'],
        'page_size': result['page_size'],
        'total_pages': result['total_pages']
    })


@bp.route('/<int:datasource_id>', methods=['GET'])
@require_auth
def get_datasource(datasource_id):
    """获取数据源详情"""
    # 1. 构建查询
    query = GetDatasourceQuery(datasource_id=datasource_id)
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.get_datasource_handler()
    
    # 3. 执行查询
    datasource = handler.handle(query)
    
    return success(data=_datasource_payload(datasource, mask_sensitive=True))


@bp.route('', methods=['POST'])
@require_auth
def create_datasource():
    """
    创建数据源
    
    Request Body:
        {
            "name": "数据源名称",
            "source_type": "maxcompute|clickhouse|postgresql|mysql",
            "description": "描述",
            "connection_config": {...},
            "extra_config": {} // 可选
        }
    
    Returns:
        201: 数据源创建成功
        400: 请求参数错误
        401: 未认证
        500: 服务器错误
    """
    try:
        # 1. 解析并验证请求
        data = request.get_json()
        schema = CreateDatasourceRequest(**data)
    except PydanticValidationError as e:
        return bad_request(message=f'请求参数验证失败: {e.errors()}')
    
    # 2. 构建命令
    command = CreateDatasourceCommand(
        name=schema.name,
        source_type=schema.source_type,
        description=schema.description,
        connection_config=schema.connection_config,
        extra_config=schema.extra_config,
        created_by=g.get('user_id', 'admin')
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.create_datasource_handler()
    
    # 4. 执行命令
    datasource = handler.handle(command)
    job_id = None
    if _should_auto_sync_catalog(datasource.source_type):
        job_id = _enqueue_catalog_sync(datasource.id)

    payload = _datasource_payload(datasource, mask_sensitive=True)
    if job_id:
        payload['catalog_sync_job'] = {'job_id': job_id, 'status': 'queued'}

    return created(data=payload, message='数据源创建成功')


@bp.route('/<int:datasource_id>', methods=['PUT'])
@require_auth
def update_datasource(datasource_id):
    """更新数据源"""
    try:
        # 1. 解析并验证请求
        data = request.get_json()
        schema = UpdateDatasourceRequest(**data)
    except PydanticValidationError as e:
        return bad_request(message=f'请求参数验证失败: {e.errors()}')
    
    # 2. 构建命令
    command = UpdateDatasourceCommand(
        datasource_id=datasource_id,
        name=schema.name,
        description=schema.description,
        connection_config=schema.connection_config,
        extra_config=schema.extra_config,
        is_active=schema.is_active
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.update_datasource_handler()
    
    # 4. 执行命令
    datasource = handler.handle(command)
    
    return success(data=_datasource_payload(datasource, mask_sensitive=True), message='数据源更新成功')


@bp.route('/<int:datasource_id>', methods=['DELETE'])
@require_auth
def delete_datasource(datasource_id):
    """删除数据源"""
    # 1. 构建命令
    command = DeleteDatasourceCommand(datasource_id=datasource_id)
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.delete_datasource_handler()
    
    # 3. 执行命令
    handler.handle(command)
    
    return success(message='数据源删除成功')


@bp.route('/<int:datasource_id>/sync-catalog', methods=['POST'])
@require_auth
def sync_datasource_catalog(datasource_id):
    """手动触发数据源目录同步。"""
    _get_datasource_or_raise(datasource_id)

    job_id = _enqueue_catalog_sync(datasource_id)
    if not job_id:
        return bad_request(message='目录同步触发失败，请稍后重试')

    return success(
        data={'job_id': job_id, 'status': 'queued'},
        message='目录同步已触发',
    )


@bp.route('/<int:datasource_id>/test', methods=['POST'])
@require_auth
def test_connection(datasource_id):
    """
    测试数据源连接（B-back-4 增强）

    成功返回:
        { ok, latency_ms, tested_at, details: { server_version, tls } }

    失败返回:
        { ok, latency_ms, tested_at, error_code, error_message, hint }
    """
    # 1. 构建查询
    query = TestConnectionQuery(datasource_id=datasource_id)

    # 2. 获取处理器
    container = get_app_container()
    handler = container.test_connection_handler()

    # 3. 执行（handler 已封装计时与错误分类）
    result = handler.handle(query)

    return success(data=result)


@bp.route('/<int:datasource_id>/databases', methods=['GET'])
@require_auth
def get_databases(datasource_id):
    """获取数据源的数据库列表"""
    # 1. 构建查询
    query = GetDatabasesQuery(datasource_id=datasource_id)
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.get_databases_handler()
    
    # 3. 执行异步查询
    databases = handler.handle(query)
    
    return success(data=databases)


@bp.route('/<int:datasource_id>/tables', methods=['GET'])
@require_auth
def get_tables(datasource_id):
    """获取指定数据库的表列表"""
    # 1. 解析查询参数
    database = request.args.get('database')
    force_refresh = request.args.get('force_refresh', 'false').lower() == 'true'
    
    if not database:
        return bad_request('缺少database参数')
    
    # 2. 构建查询
    query = GetTablesQuery(
        datasource_id=datasource_id,
        database=database,
        force_refresh=force_refresh
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.get_tables_handler()
    
    # 4. 执行异步查询
    tables, _ = handler.handle(query)
    
    return success(data=tables)


@bp.route('/<int:datasource_id>/schemas', methods=['GET'])
@require_auth
def get_schemas(datasource_id):
    """获取指定数据库的Schema列表"""
    # 1. 解析参数
    database = request.args.get('database')
    if not database:
        return bad_request('缺少database参数')
    
    # 2. 构建查询
    query = GetSchemasQuery(
        datasource_id=datasource_id,
        database=database
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.get_schemas_handler()
    
    # 4. 执行查询
    schemas = handler.handle(query)
    
    return success(data=schemas)


@bp.route('/<int:datasource_id>/table-schema', methods=['GET'])
@require_auth
def get_table_schema(datasource_id):
    """获取表的Schema信息（字段列表、主键、分区键等）"""
    # 1. 解析参数
    database = request.args.get('database')
    table = request.args.get('table')
    schema = request.args.get('schema')  # 可选，默认 public
    
    if not database:
        return bad_request('缺少database参数')
    if not table:
        return bad_request('缺少table参数')
    
    # 2. 构建查询
    query = GetTableSchemaQuery(
        datasource_id=datasource_id,
        database=database,
        table=table,
        schema=schema
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.get_table_schema_handler()
    
    # 4. 执行查询
    result = handler.handle(query)
    
    return success(data=result)


@bp.route('/statistics', methods=['GET'])
@require_auth
def get_statistics():
    """获取数据源统计信息"""
    # 1. 构建查询
    query = GetStatisticsQuery()
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.get_datasource_statistics_handler()
    
    # 3. 执行查询
    stats = handler.handle(query)
    
    return success(data=stats)


@bp.route('/types', methods=['GET'])
@require_auth
def get_supported_types():
    """获取支持的数据源类型列表"""
    # 数据源类型元信息
    TYPE_METADATA = {
        'postgresql': {'display_name': 'PostgreSQL', 'description': '开源关系型数据库'},
        'mysql': {'display_name': 'MySQL', 'description': '流行的关系型数据库'},
        'clickhouse': {'display_name': 'ClickHouse', 'description': '高性能列式数据库'},
        'maxcompute': {'display_name': 'MaxCompute', 'description': '阿里云大数据计算服务'},
    }
    
    from app.infrastructure.adapters.datasources.factory import AdapterFactory
    
    supported_types = AdapterFactory.get_supported_types()
    
    # 构建带元信息的类型列表
    types_with_meta = []
    for t in supported_types:
        meta = TYPE_METADATA.get(t, {'display_name': t, 'description': ''})
        types_with_meta.append({
            'type': t,
            'display_name': meta['display_name'],
            'description': meta.get('description', '')
        })
    
    return success(data=types_with_meta)


# ============================================================================
# B-back-5: 数据源 Schema 浏览接口
# ============================================================================

def _get_schema_service():
    """懒加载 SchemaBrowserService（避免循环导入）。"""
    container = get_app_container()
    datasource_repo = container.datasource_repository()
    from app.application.datasources.schema_browser_service import SchemaBrowserService
    return SchemaBrowserService(datasource_repository=datasource_repo)


@bp.route('/<int:datasource_id>/schema', methods=['GET'])
@require_auth
def get_datasource_schema(datasource_id):
    """GET /api/v1/data-center/datasources/:id/schema — 列出所有数据库。

    Query:
        refresh=1   强制跳过缓存
    """
    refresh = request.args.get("refresh", "0") in ("1", "true")
    try:
        result = _get_schema_service().list_databases(datasource_id, refresh=refresh)
    except Exception as exc:
        return bad_request(str(exc))
    return success(data=result)


@bp.route('/<int:datasource_id>/schema/<database>', methods=['GET'])
@require_auth
def get_datasource_schema_tables(datasource_id, database):
    """GET /api/v1/data-center/datasources/:id/schema/:database — 列出数据库所有表。

    Query:
        refresh=1   强制跳过缓存
    """
    refresh = request.args.get("refresh", "0") in ("1", "true")
    try:
        result = _get_schema_service().list_tables(datasource_id, database, refresh=refresh)
    except Exception as exc:
        return bad_request(str(exc))
    return success(data=result)


@bp.route('/<int:datasource_id>/schema/<database>/<table>', methods=['GET'])
@require_auth
def get_datasource_schema_table(datasource_id, database, table):
    """GET /api/v1/data-center/datasources/:id/schema/:database/:table — 字段详情。

    Query:
        refresh=1   强制跳过缓存
    """
    refresh = request.args.get("refresh", "0") in ("1", "true")
    try:
        result = _get_schema_service().get_table_schema(
            datasource_id, database, table, refresh=refresh
        )
    except Exception as exc:
        return bad_request(str(exc))
    return success(data=result)


@bp.route('/<int:datasource_id>/tables/<path:table>/preview', methods=['GET'])
@require_auth
def preview_table_data(datasource_id, table):
    """预览表数据（获取前N条记录）"""
    # 1. 解析查询参数
    database = request.args.get('database')
    limit = request.args.get('limit', 10, type=int)
    
    if not database:
        return bad_request('缺少database参数')
    
    # 限制最大查询数量
    if limit > 100:
        limit = 100
    
    # 2. 构建查询
    query = PreviewTableDataQuery(
        datasource_id=datasource_id,
        database=database,
        table=table,
        limit=limit
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.preview_table_data_handler()
    
    # 4. 执行异步查询
    result = handler.handle(query)
    
    return success(data=result)
