"""
渠道管理 API
"""
from flask import Blueprint, request, g

from app.di.container import get_container
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, created
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('channels_api_v1', __name__, url_prefix='/api/v1/channels')


def _get_service():
    return get_container().channel_service()


@bp.route('', methods=['GET'])
@require_auth
def list_channels():
    """查询渠道列表"""
    channel_type = request.args.get('channel_type')
    enabled = request.args.get('enabled')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    if enabled is not None:
        enabled = enabled.lower() == 'true'

    service = _get_service()
    result = service.list_channels(
        channel_type=channel_type,
        enabled=enabled,
        page=page,
        page_size=page_size
    )
    return success(data=result)


@bp.route('', methods=['POST'])
@require_auth
def create_channel():
    """创建渠道"""
    data = request.get_json()
    user_id = g.user_id

    service = _get_service()
    channel = service.create_channel(
        name=data['name'],
        channel_type=data['channel_type'],
        config=data.get('config', {}),
        description=data.get('description'),
        created_by=user_id,
        enabled=data.get('enabled', True)
    )
    return created(data=channel)


@bp.route('/<int:channel_id>', methods=['GET'])
@require_auth
def get_channel(channel_id: int):
    """获取渠道详情"""
    service = _get_service()
    channel = service.get_channel(channel_id)
    return success(data=channel)


@bp.route('/<int:channel_id>', methods=['PUT'])
@require_auth
def update_channel(channel_id: int):
    """更新渠道"""
    data = request.get_json()

    service = _get_service()
    channel = service.update_channel(
        channel_id=channel_id,
        name=data.get('name'),
        config=data.get('config'),
        description=data.get('description'),
        enabled=data.get('enabled')
    )
    return success(data=channel)


@bp.route('/<int:channel_id>', methods=['DELETE'])
@require_auth
def delete_channel(channel_id: int):
    """删除渠道"""
    service = _get_service()
    service.delete_channel(channel_id)
    return success()


@bp.route('/<int:channel_id>/enable', methods=['POST'])
@require_auth
def enable_channel(channel_id: int):
    """启用渠道"""
    service = _get_service()
    channel = service.enable_channel(channel_id)
    return success(data=channel)


@bp.route('/<int:channel_id>/disable', methods=['POST'])
@require_auth
def disable_channel(channel_id: int):
    """禁用渠道"""
    service = _get_service()
    channel = service.disable_channel(channel_id)
    return success(data=channel)


@bp.route('/<int:channel_id>/test', methods=['POST'])
@require_auth
def test_channel(channel_id: int):
    """测试渠道连通性

    可选 body: ``{ "message": "自定义测试消息" }``

    响应: ``{ ok, channel_type, latency_ms, status_code, detail, error, dry_run }``
    """
    data = request.get_json(silent=True) or {}
    message = data.get('message')

    service = _get_service()
    result = service.test_channel(channel_id, message=message)
    return success(data=result)
