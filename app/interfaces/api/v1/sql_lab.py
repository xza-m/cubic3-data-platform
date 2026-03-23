"""
SQL Lab API - SQL编辑器和查询执行
支持同步和异步两种模式
"""
from flask import Blueprint, request, g
from app.interfaces.api.middleware.auth import require_auth
from app.shared.exceptions import ValidationError, ApplicationException
from app.shared.response import success, not_found, bad_request, error
from app.shared.utils.logger import get_logger
from app.shared.utils.security import generate_trace_id
from app.shared.utils.sql_validator import validate_sql_query
from app.di.utils import get_app_container
from app.domain.entities.sql_query import SQLQueryStatus

logger = get_logger(__name__)

bp = Blueprint('sql_lab', __name__, url_prefix='/api/v1/sql_lab')


@bp.route('/execute', methods=['POST'])
@require_auth
def execute_sql():
    """
    执行 SQL 查询（预览）
    
    支持两种模式：
    - 同步模式（默认）：等待查询完成后返回结果
    - 异步模式（async=true）：立即返回 query_id，通过轮询获取结果
    """
    trace_id = generate_trace_id()
    
    try:
        data = request.get_json()
        source_id = data.get('source_id')
        sql_query = data.get('sql_query', '').strip()
        limit = data.get('limit', 100)
        async_mode = data.get('async', False)
        
        if not source_id:
            raise ValueError("source_id 是必需的")
        if not sql_query:
            raise ValueError("sql_query 是必需的")
        
        # SQL 安全性验证
        is_valid, errors = validate_sql_query(sql_query)
        if not is_valid:
            raise ValidationError(f"SQL 校验失败: {'; '.join(errors)}")
        
        if async_mode:
            return _execute_async(source_id, sql_query, limit, trace_id)
        
        return _execute_sync(source_id, sql_query, limit, trace_id)
        
    except (ValueError, ApplicationException) as e:
        return bad_request(message=str(e))


def _execute_sync(source_id: int, sql_query: str, limit: int, trace_id: str):
    """同步执行 SQL 查询"""
    from app.application.query.commands.execute_sql_preview import ExecuteSQLPreviewCommand
    
    command = ExecuteSQLPreviewCommand(
        source_id=source_id,
        sql_query=sql_query,
        limit=limit
    )
    
    container = get_app_container()
    handler = container.execute_sql_preview_handler()
    
    result = handler.handle(command)
    
    return success(data=result)


def _execute_async(source_id: int, sql_query: str, limit: int, trace_id: str):
    """异步执行 SQL 查询（通过 Handler 操作，不直接使用 db.session）"""
    from app.infrastructure.tasks.task_queue import TaskQueueManager
    
    user_id = getattr(g, 'user_id', None)
    container = get_app_container()
    handler = container.submit_async_query_handler()
    
    # 创建查询记录
    query = handler.handle(
        source_id=source_id,
        sql=sql_query,
        limit=limit,
        user_id=user_id
    )
    
    # 提交到任务队列
    try:
        task_queue = TaskQueueManager()
        job_id = task_queue.enqueue_sql_query(query.id)
        
        handler.update_job_id(query, job_id)
        
        logger.info(
            f"SQL query submitted to queue",
            extra={
                'trace_id': trace_id,
                'query_id': query.id,
                'job_id': job_id
            }
        )
        
        return success(
            data={'query_id': query.id, 'status': query.status},
            message='查询已提交',
            status=202
        )
        
    except Exception as e:
        handler.mark_failed(query, f"任务队列提交失败: {str(e)}")
        raise


@bp.route('/query/<int:query_id>/status', methods=['GET'])
@require_auth
def get_query_status(query_id: int):
    """获取异步查询状态"""
    container = get_app_container()
    handler = container.get_query_status_handler()
    
    status_dict = handler.handle(query_id)
    if not status_dict:
        return not_found(f'查询记录不存在: {query_id}')
    
    return success(data=status_dict)


@bp.route('/query/<int:query_id>/result', methods=['GET'])
@require_auth
def get_query_result(query_id: int):
    """获取异步查询结果"""
    container = get_app_container()
    handler = container.get_query_result_handler()
    
    query = handler.handle(query_id)
    if not query:
        return not_found(f'查询记录不存在: {query_id}')
    
    # 查询未完成
    if not query.is_finished():
        return error(message='查询尚未完成', status=202, details={'status': query.status})
    
    # 查询失败
    if query.status == SQLQueryStatus.FAILED:
        return error(message=query.error_message or '查询执行失败')
    
    # 查询成功，返回完整结果
    return success(data=query.to_dict(include_result=True))


@bp.route('/validate', methods=['POST'])
@require_auth
def validate_sql():
    """验证 SQL 语法"""
    data = request.get_json()
    sql_query = data.get('sql_query', '').strip()
    
    is_valid, errors = validate_sql_query(sql_query)
    
    return success(data={
        "valid": is_valid,
        "errors": errors
    })
