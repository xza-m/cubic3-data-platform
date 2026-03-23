"""
应用实例管理 API
"""
from flask import Blueprint, request, g

from app.di.container import get_container
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, created, not_found, server_error
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('app_instances_api_v1', __name__, url_prefix='/api/v1/app-instances')


def _get_instance_service():
    return get_container().app_instance_service()


def _get_execution_service():
    return get_container().execution_service()


@bp.route('', methods=['GET'])
@require_auth
def list_instances():
    """查询应用实例列表"""
    app_code = request.args.get('app_code')
    owner = request.args.get('owner')
    enabled = request.args.get('enabled')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    if enabled is not None:
        enabled = enabled.lower() == 'true'

    service = _get_instance_service()
    result = service.list_instances(
        app_code=app_code,
        owner=owner,
        enabled=enabled,
        page=page,
        page_size=page_size
    )
    return success(data=result)


@bp.route('', methods=['POST'])
@require_auth
def create_instance():
    """创建应用实例"""
    data = request.get_json()
    user_id = g.user_id

    service = _get_instance_service()
    instance = service.create_instance(
        app_code=data['app_code'],
        name=data['name'],
        config=data.get('config') or data.get('app_config', {}),
        schedule_type=data.get('schedule_type') or data.get('trigger_type', 'manual'),
        owner=user_id,
        description=data.get('description'),
        schedule_config=data.get('schedule_config') or data.get('trigger_config'),
        enabled=data.get('enabled', False)
    )
    return created(data=instance)


@bp.route('/<int:instance_id>', methods=['GET'])
@require_auth
def get_instance(instance_id: int):
    """获取实例详情"""
    service = _get_instance_service()
    instance = service.get_instance(instance_id, include_stats=True)

    if not instance:
        return not_found(message='实例不存在')

    return success(data=instance)


@bp.route('/<int:instance_id>', methods=['PUT'])
@require_auth
def update_instance(instance_id: int):
    """更新实例"""
    data = request.get_json()
    user_id = g.user_id

    service = _get_instance_service()
    instance = service.update_instance(
        instance_id=instance_id,
        user=user_id,
        name=data.get('name'),
        description=data.get('description'),
        config=data.get('config'),
        schedule_type=data.get('schedule_type'),
        schedule_config=data.get('schedule_config'),
        roles=g.user_roles
    )
    return success(data=instance)


@bp.route('/<int:instance_id>', methods=['DELETE'])
@require_auth
def delete_instance(instance_id: int):
    """删除实例"""
    user_id = g.user_id

    service = _get_instance_service()
    service.delete_instance(instance_id, user_id, roles=g.user_roles)
    return success()


@bp.route('/<int:instance_id>/enable', methods=['POST'])
@require_auth
def enable_instance(instance_id: int):
    """启用实例"""
    user_id = g.user_id

    service = _get_instance_service()
    instance = service.enable_instance(instance_id, user_id, roles=g.user_roles)
    return success(data=instance)


@bp.route('/<int:instance_id>/disable', methods=['POST'])
@require_auth
def disable_instance(instance_id: int):
    """禁用实例"""
    user_id = g.user_id

    service = _get_instance_service()
    instance = service.disable_instance(instance_id, user_id, roles=g.user_roles)
    return success(data=instance)


@bp.route('/<int:instance_id>/execute', methods=['POST'])
@require_auth
def execute_instance(instance_id: int):
    """手动触发执行"""
    user_id = g.user_id

    service = _get_execution_service()
    execution_id = service.execute_instance(
        instance_id=instance_id,
        trigger_type='manual',
        triggered_by=user_id
    )
    return success(data={'execution_id': execution_id})
