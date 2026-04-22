"""
提取任务 REST API（新架构）
"""
import os
from datetime import datetime
from flask import Blueprint, request, g
from pydantic import ValidationError as PydanticValidationError
from app.application.extraction.commands.create_task import CreateTaskCommand
from app.application.extraction.commands.update_task import UpdateTaskCommand
from app.application.extraction.commands.delete_task import DeleteTaskCommand
from app.application.extraction.commands.execute_task import ExecuteTaskCommand
from app.application.extraction.queries.list_tasks import ListTasksQuery
from app.application.extraction.queries.preview_data import PreviewDataQuery
from app.application.extraction.schemas.task_schemas import (
    CreateTaskRequest,
    ExecuteTaskRequest,
)
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, created, not_found, bad_request
from app.shared.utils.logger import get_logger
from app.shared.utils.security import generate_trace_id
from app.di.utils import get_app_container

logger = get_logger(__name__)

# 创建 Blueprint
bp = Blueprint('extraction_api_v1', __name__, url_prefix='/api/v1/extraction')


# ============================================================================
# 任务管理 API
# ============================================================================

@bp.route('/tasks', methods=['POST'])
@require_auth
def create_task():
    """
    创建提取任务
    
    Request Body:
        {
            "task_name": "每日订单提取",
            "dataset_id": 1,
            "select_fields": ["ds", "order_id", "amount"],
            "filter_conditions": {...},
            "row_limit": 500000
        }
    
    Returns:
        201: 任务创建成功
        400: 请求参数错误
        401: 未认证
        500: 服务器错误
    """
    trace_id = generate_trace_id()
    
    try:
        # 1. 解析并验证请求（Pydantic）
        data = request.get_json()
        schema = CreateTaskRequest(**data)
    except PydanticValidationError as e:
        return bad_request(
            message='请求参数验证失败',
            details=e.errors(include_context=False, include_input=False, include_url=False),
        )
    
    # 2. 构建命令
    command = CreateTaskCommand(
        task_name=schema.task_name,
        dataset_id=schema.dataset_id,
        select_fields=schema.select_fields,
        filter_conditions=schema.filter_conditions,
        row_limit=schema.row_limit,
        task_type=schema.task_type,
        schedule_config=schema.schedule_config,
        subscription_config=schema.subscription_config,
        created_by=g.user_id
    )
    
    # 3. 获取处理器（依赖注入）
    container = get_app_container()
    handler = container.create_task_handler()
    
    # 4. 处理命令
    task = handler.handle(command)
    
    logger.info(
        f"Task created",
        task_id=task.id,
        trace_id=trace_id
    )
    
    # 5. 清除任务列表缓存（确保新任务立即显示）
    from app.infrastructure.cache.redis_client import get_redis_client
    redis_client = get_redis_client()
    redis_client.delete_pattern('query_cache:list_tasks:*')
    logger.debug("Task list cache invalidated after task creation")
    
    # 6. 返回响应
    return created(data=task.to_dict(), message='任务创建成功')


@bp.route('/tasks/<int:task_id>', methods=['PUT'])
@require_auth
def update_task(task_id: int):
    """
    更新提取任务
    
    Args:
        task_id: 任务ID
    
    Request Body:
        {
            "task_name": "新任务名称",
            "select_fields": ["field1", "field2"],
            "filter_conditions": {...},
            "row_limit": 100000,
            "is_active": true
        }
    
    Returns:
        200: 任务更新成功
        400: 请求参数错误
        404: 任务不存在
    """
    trace_id = generate_trace_id()
    
    # 1. 解析请求
    data = request.get_json() or {}
    
    # 2. 构建命令
    command = UpdateTaskCommand(
        task_id=task_id,
        task_name=data.get('task_name'),
        select_fields=data.get('select_fields'),
        filter_conditions=data.get('filter_conditions'),
        row_limit=data.get('row_limit'),
        schedule_config=data.get('schedule_config'),
        subscription_config=data.get('subscription_config'),
        is_active=data.get('is_active'),
        updated_by=g.user_id
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.update_task_handler()
    
    # 4. 处理命令
    task = handler.handle(command)
    
    logger.info(
        f"Task updated",
        task_id=task.id,
        trace_id=trace_id
    )
    
    # 5. 清除任务列表缓存
    from app.infrastructure.cache.redis_client import get_redis_client
    redis_client = get_redis_client()
    redis_client.delete_pattern('query_cache:list_tasks:*')
    logger.debug("Task list cache invalidated after task update")
    
    # 6. 返回响应
    return success(data=task.to_dict(), message='任务更新成功')


@bp.route('/tasks/<int:task_id>', methods=['DELETE'])
@require_auth
def delete_task(task_id: int):
    """
    删除提取任务
    
    Args:
        task_id: 任务ID
    
    Returns:
        200: 任务删除成功
        404: 任务不存在
    """
    trace_id = generate_trace_id()
    
    # 1. 构建命令
    command = DeleteTaskCommand(
        task_id=task_id,
        deleted_by=g.user_id
    )
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.delete_task_handler()
    
    # 3. 处理命令
    result = handler.handle(command)
    
    logger.info(
        f"Task deleted",
        task_id=task_id,
        success=result,
        trace_id=trace_id
    )
    
    # 4. 清除任务列表缓存
    from app.infrastructure.cache.redis_client import get_redis_client
    redis_client = get_redis_client()
    redis_client.delete_pattern('query_cache:list_tasks:*')
    logger.debug("Task list cache invalidated after task deletion")
    
    # 5. 返回响应
    return success(message='任务删除成功')


@bp.route('/tasks/<int:task_id>/execute', methods=['POST'])
@require_auth
def execute_task(task_id: int):
    """
    执行提取任务（异步）
    
    Args:
        task_id: 任务ID
    
    Returns:
        200: 任务已提交执行
        400: 请求参数错误
        404: 任务不存在
    """
    trace_id = generate_trace_id()
    
    # 1. 解析请求
    data = request.get_json() or {}
    schema = ExecuteTaskRequest(**data)
    
    # 2. 构建命令
    command = ExecuteTaskCommand(
        task_id=task_id,
        triggered_by=schema.triggered_by or g.user_id,
        user_id=g.user_id,
        trace_id=trace_id
    )
    
    # 3. 获取处理器
    container = get_app_container()
    handler = container.execute_task_handler()
    
    # 4. 处理命令
    result = handler.handle(command)
    
    logger.info(
        f"Task execution initiated",
        task_id=task_id,
        run_id=result['run_id'],
        job_id=result.get('job_id'),
        trace_id=trace_id
    )
    
    # 5. 清除任务列表缓存（任务状态可能改变）
    from app.infrastructure.cache.redis_client import get_redis_client
    redis_client = get_redis_client()
    redis_client.delete_pattern('query_cache:list_tasks:*')
    logger.debug("Task list cache invalidated after task execution")
    
    # 6. 返回响应
    return success(data=result, message='任务已提交执行')


@bp.route('/tasks', methods=['GET'])
@require_auth
def list_tasks():
    """
    获取任务列表（读操作优化）
    
    Query Parameters:
        - dataset_id: 数据集ID筛选
        - task_type: 任务类型筛选
        - is_active: 活跃状态筛选
        - page: 页码
        - page_size: 每页数量
    
    Returns:
        200: 任务列表
    """
    # 1. 解析查询参数
    query = ListTasksQuery(
        dataset_id=request.args.get('dataset_id', type=int),
        task_type=request.args.get('task_type'),
        is_active=request.args.get('is_active', type=lambda v: v.lower() == 'true') if request.args.get('is_active') else None,
        page=request.args.get('page', 1, type=int),
        page_size=request.args.get('page_size', 20, type=int)
    )
    
    # 2. 获取处理器（使用 SQLAlchemy Core）
    container = get_app_container()
    handler = container.list_tasks_handler()
    
    # 3. 处理查询（可能从缓存返回）
    from app.infrastructure.cache.decorators import query_cache
    
    @query_cache('list_tasks', ttl=300)  # 缓存5分钟
    def _execute_query():
        return handler.handle(query)
    
    result = _execute_query()
    
    # 4. 返回响应
    return success(data={
        'items': [item.model_dump() for item in result['items']],
        'total': result['total'],
        'page': result['page'],
        'page_size': result['page_size'],
        'total_pages': result['total_pages']
    })


@bp.route('/runs', methods=['GET'])
@require_auth
def list_runs():
    """
    获取执行记录列表
    
    Query Parameters:
        - task_id: 任务ID筛选
        - status: 状态筛选（success/failed/running）
        - page: 页码
        - page_size: 每页数量
    
    Returns:
        200: 执行记录列表
    """
    task_id = request.args.get('task_id', type=int)
    status = request.args.get('status')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    
    container = get_app_container()
    repo = container.extraction_repository()
    result = repo.list_runs(
        task_id=task_id,
        status=status,
        page=page,
        page_size=page_size
    )
    
    runs = result['items']
    total = result['total']
    
    return success(data={
        'items': [run.to_dict() for run in runs],
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    })


@bp.route('/runs/<int:run_id>/rerun', methods=['POST'])
@require_auth
def rerun_run(run_id: int):
    """
    基于已存在的执行记录发起重跑（Round 4 · R-001-P17c）。

    语义：
      - 不修改原 run；以原 run.task_id 构造新的 ExecuteTaskCommand，交给标准执行器
      - 触发人取自 header（g.user_id），保留 source_run_id 便于审计
      - 不支持 query 参数覆盖；如需覆写 filter_conditions 请走 /tasks/<id>/execute

    Returns:
        200: { data: { run_id, source_run_id, task_id, status, job_id }, ... }
        401: 未认证
        404: 原 run 不存在
    """
    trace_id = generate_trace_id()
    container = get_app_container()
    repo = container.extraction_repository()

    source_run = repo.find_run_by_id(run_id)
    if not source_run:
        return not_found(f'执行记录 {run_id} 不存在')

    command = ExecuteTaskCommand(
        task_id=source_run.task_id,
        triggered_by=g.user_id,
        user_id=g.user_id,
        trace_id=trace_id,
    )

    handler = container.execute_task_handler()
    result = handler.handle(command)

    logger.info(
        'Extraction run rerun initiated',
        source_run_id=run_id,
        task_id=source_run.task_id,
        new_run_id=result['run_id'],
        job_id=result.get('job_id'),
        triggered_by=g.user_id,
        trace_id=trace_id,
    )

    from app.infrastructure.cache.redis_client import get_redis_client
    get_redis_client().delete_pattern('query_cache:list_tasks:*')

    return success(
        data={
            'run_id': result['run_id'],
            'source_run_id': run_id,
            'task_id': source_run.task_id,
            'status': result['status'],
            'job_id': result.get('job_id'),
        },
        message='已基于原执行记录重新提交',
    )


def _synthesize_run_logs(run, include_sql: bool, include_stack: bool, levels: set | None):
    """
    Round 4 · R-001-P17c — 从 ExtractionRun 的状态字段合成结构化日志。

    现阶段 DB 未持久化逐步日志，本函数以 (start_time / end_time / status / error_message /
    error_stack / generated_sql / row_count / result_file_path / duration_ms) 为蓝本，
    稳定地生成 {ts, level, message} 列表，供前端日志面板展示。

    未来若接入真正的日志存储（ClickHouse / OpenSearch / 文件），应替换本函数的实现、
    保持返回结构不变（items: List[Dict] + total: int）。
    """
    from app.shared.enums import TaskStatus

    items: list[dict] = []

    def _append(ts, level: str, message: str):
        if levels and level not in levels:
            return
        if ts is None:
            return
        items.append(
            {
                'ts': ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                'level': level,
                'message': message,
            }
        )

    status = run.status or ''
    start_ts = run.start_time or run.created_at
    end_ts = run.end_time
    run_type = run.run_type or 'manual'

    _append(start_ts, 'INFO', f'run#{run.id} · task#{run.task_id} · type={run_type} · triggered_by={run.triggered_by or "-"}')

    if include_sql and run.generated_sql:
        sql = run.generated_sql.strip()
        if len(sql) > 4000:
            sql = sql[:4000] + '…(truncated)'
        _append(start_ts, 'DEBUG', f'SQL: {sql}')

    if status == TaskStatus.RUNNING.value and not end_ts:
        _append(start_ts, 'INFO', 'status=running')
    elif status == TaskStatus.SUCCESS.value:
        parts = [f'rows={run.row_count or 0}']
        if run.result_size_mb is not None:
            parts.append(f'size_mb={run.result_size_mb:.3f}')
        if run.duration_ms:
            parts.append(f'duration_ms={run.duration_ms}')
        if run.delivery_method:
            parts.append(f'delivery={run.delivery_method}')
        _append(end_ts, 'INFO', 'completed · ' + ' · '.join(parts))
    elif status == TaskStatus.FAILED.value:
        _append(end_ts, 'ERROR', run.error_message or 'task failed')
        if include_stack and run.error_stack:
            stack = run.error_stack.strip()
            if len(stack) > 8000:
                stack = stack[:8000] + '…(truncated)'
            _append(end_ts, 'ERROR', stack)
    elif status == TaskStatus.TIMEOUT.value:
        _append(end_ts, 'ERROR', run.error_message or 'task execution timeout')
    elif status == TaskStatus.PENDING.value:
        _append(start_ts, 'INFO', 'status=pending (queued)')

    return items


@bp.route('/runs/<int:run_id>/logs', methods=['GET'])
@require_auth
def run_logs(run_id: int):
    """
    获取执行记录的结构化日志（Round 4 · R-001-P17c）。

    Query Parameters:
        - include_sql    = true/false（默认 false）
        - include_stack  = true/false（默认 false）
        - levels         = INFO,ERROR  逗号分隔，子集过滤；为空表示全部
        - page/page_size = 分页（默认 1/200）；当前合成行数有限，一般一次取完即可

    Returns:
        200: { items: [{ts, level, message}], total, page, page_size }
        401: 未认证
        404: run 不存在
    """
    container = get_app_container()
    repo = container.extraction_repository()

    run = repo.find_run_by_id(run_id)
    if not run:
        return not_found(f'执行记录 {run_id} 不存在')

    def _bool(v):
        return str(v or '').lower() in ('1', 'true', 'yes', 'on')

    include_sql = _bool(request.args.get('include_sql'))
    include_stack = _bool(request.args.get('include_stack'))

    levels_raw = request.args.get('levels') or ''
    levels = {lv.strip().upper() for lv in levels_raw.split(',') if lv.strip()} or None

    page = max(1, request.args.get('page', 1, type=int))
    page_size = max(1, min(request.args.get('page_size', 200, type=int), 1000))

    all_items = _synthesize_run_logs(run, include_sql=include_sql, include_stack=include_stack, levels=levels)
    total = len(all_items)
    start = (page - 1) * page_size
    end = start + page_size
    items = all_items[start:end]

    return success(
        data={
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
        }
    )


@bp.route('/runs/<int:run_id>/download', methods=['GET'])
@require_auth
def download_result(run_id: int):
    """
    下载执行结果文件
    
    Args:
        run_id: 执行记录ID
    
    Returns:
        200: 文件流（CSV）
        400: 文件不可下载
        404: 执行记录不存在
    """
    from flask import send_file
    
    trace_id = generate_trace_id()
    
    # 1. 查询执行记录
    container = get_app_container()
    repo = container.extraction_repository()
    run = repo.find_run_by_id(run_id)
    if not run:
        return not_found(f'执行记录 {run_id} 不存在')
    
    # 2. 验证用户权限
    # NOTE: 当前允许所有认证用户下载，待权限系统完善后限制访问
    
    # 3. 检查文件是否可下载
    if not run.can_download():
        return bad_request(
            message='文件不可下载',
            details={
                'status': run.status,
                'delivery_method': run.delivery_method,
                'has_file': run.result_file_path is not None
            }
        )
    
    # 4. 检查文件是否存在
    if not os.path.exists(run.result_file_path):
        return not_found('文件不存在或已被清理')
    
    # 5. 流式传输文件
    task_name = run.task.task_name if run.task else 'extraction'
    download_name = f"{task_name}_{run_id}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    logger.info(
        f"File download started",
        run_id=run_id,
        file_path=run.result_file_path,
        user_id=g.user_id,
        trace_id=trace_id
    )
    
    return send_file(
        run.result_file_path,
        as_attachment=True,
        download_name=download_name,
        mimetype='text/csv',
        max_age=0  # 禁用缓存
    )


@bp.route('/preview', methods=['POST'])
@require_auth
def preview_data():
    """
    预览数据（小数据量查询）
    
    Request Body:
        {
            "dataset_id": 1,
            "select_fields": ["ds", "order_id"],
            "filter_conditions": {...},
            "limit": 10
        }
    
    Returns:
        200: 预览数据
    """
    trace_id = generate_trace_id()
    
    # 1. 解析请求
    data = request.get_json()
    
    query = PreviewDataQuery(
        dataset_id=data['dataset_id'],
        select_fields=data['select_fields'],
        filter_conditions=data['filter_conditions'],
        limit=data.get('limit', 10),
        user_id=g.user_id
    )
    
    # 2. 获取处理器
    container = get_app_container()
    handler = container.preview_data_handler()
    
    # 3. 处理查询
    result = handler.handle(query)
    
    logger.info(
        f"Data preview completed",
        dataset_id=query.dataset_id,
        row_count=result['total'],
        trace_id=trace_id
    )
    
    # 4. 返回响应
    return success(data=result)


# ============================================================================
# 健康检查
# ============================================================================

@bp.route('/health', methods=['GET'])
def health_check():
    """
    健康检查端点
    
    Returns:
        200: 服务健康
        503: 服务不健康
    """
    from app.shared.response import error as error_response
    
    try:
        from app.infrastructure.database.session import get_db_engine
        from app.infrastructure.cache.redis_client import get_redis_client
        from sqlalchemy import text
        
        engine = get_db_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = 'up'
        
        redis_client = get_redis_client()
        redis_client.client.ping()
        redis_status = 'up'
        
        from app.infrastructure.tasks.task_queue import TaskQueueManager
        queue_manager = TaskQueueManager()
        queue_info = queue_manager.get_queue_info()
        queue_status = 'up' if 'error' not in queue_info else 'down'
        
        overall_status = all([
            db_status == 'up',
            redis_status == 'up',
            queue_status == 'up'
        ])
        
        health_data = {
            'status': 'healthy' if overall_status else 'unhealthy',
            'components': {
                'database': db_status,
                'redis': redis_status,
                'task_queue': queue_status,
                'queue_info': queue_info if queue_status == 'up' else None
            }
        }
        
        if overall_status:
            return success(data=health_data)
        else:
            return error_response(message='unhealthy', status=503, details=health_data)
    
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return error_response(message='unhealthy', status=503, details={'error': str(e)})
