"""
执行记录查询 API
"""
from flask import Blueprint, request
from datetime import datetime
from app.di.container import get_container
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, not_found
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('app_executions_api_v1', __name__, url_prefix='/api/v1/app-executions')


def _get_service():
    return get_container().execution_service()


@bp.route('', methods=['GET'])
@require_auth
def list_executions():
    """查询执行记录列表"""
    instance_id = request.args.get('instance_id', type=int)
    status = request.args.get('status')
    trigger_type = request.args.get('trigger_type')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    if start_date:
        start_date = datetime.fromisoformat(start_date)
    if end_date:
        end_date = datetime.fromisoformat(end_date)

    service = _get_service()
    result = service.list_executions(
        instance_id=instance_id,
        status=status,
        trigger_type=trigger_type,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size
    )
    return success(data=result)


@bp.route('/<int:execution_id>', methods=['GET'])
@require_auth
def get_execution(execution_id: int):
    """获取执行详情"""
    service = _get_service()
    execution = service.get_execution(execution_id)

    if not execution:
        return not_found('执行记录不存在')

    return success(data=execution)


@bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """获取执行统计信息"""
    instance_id = request.args.get('instance_id', type=int)
    days = request.args.get('days', 7, type=int)

    service = _get_service()
    stats = service.get_execution_stats(instance_id=instance_id, days=days)
    return success(data=stats)
