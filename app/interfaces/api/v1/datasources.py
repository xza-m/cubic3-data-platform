"""
数据源管理 REST API（新架构）
"""

from flask import Blueprint, request, g
from pydantic import ValidationError as PydanticValidationError
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
from app.interfaces.api.middleware.auth import require_auth, optional_auth
from app.shared.response import success, created, bad_request
from app.shared.utils.logger import get_logger
from app.di.utils import get_app_container

logger = get_logger(__name__)

# 创建 Blueprint
bp = Blueprint('datasources_api_v1', __name__, url_prefix='/api/v1/data-center/datasources')


# ============================================================================
# 数据源管理 API
# ============================================================================

@bp.route('', methods=['GET'])
@optional_auth
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
    items = [ds.to_dict(mask_sensitive=True) for ds in result['items']]
    
    return success(data={
        'items': items,
        'total': result['total'],
        'page': result['page'],
        'page_size': result['page_size'],
        'total_pages': result['total_pages']
    })


@bp.route('/<int:datasource_id>', methods=['GET'])
@optional_auth
def get_datasource(datasource_id):
    """获取数据源详情"""
    # 1. 构建查询
    query = GetDatasourceQuery(datasource_id=datasource_id)
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.get_datasource_handler()
    
    # 3. 执行查询
    datasource = handler.handle(query)
    
    return success(data=datasource.to_dict(mask_sensitive=True))


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
    
    return created(data=datasource.to_dict(mask_sensitive=True), message='数据源创建成功')


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
    
    return success(data=datasource.to_dict(mask_sensitive=True), message='数据源更新成功')


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


@bp.route('/<int:datasource_id>/test', methods=['POST'])
@optional_auth
def test_connection(datasource_id):
    """测试数据源连接"""
    # 1. 构建查询
    query = TestConnectionQuery(datasource_id=datasource_id)
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.test_connection_handler()
    
    # 3. 执行异步查询
    result = handler.handle(query)
    
    return success(data=result)


@bp.route('/<int:datasource_id>/databases', methods=['GET'])
@optional_auth
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
@optional_auth
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
@optional_auth
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
@optional_auth
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
@optional_auth
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


@bp.route('/<int:datasource_id>/tables/<path:table>/preview', methods=['GET'])
@optional_auth
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
