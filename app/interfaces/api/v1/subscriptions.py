"""
订阅管理 API
"""
from flask import Blueprint, request, g

from app.di.container import get_container
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, created
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)
bp = Blueprint('subscriptions_api_v1', __name__, url_prefix='/api/v1/subscriptions')


def _get_service():
    return get_container().subscription_service()


@bp.route('', methods=['GET'])
@require_auth
def list_subscriptions():
    """查询订阅列表"""
    app_instance_id = request.args.get('app_instance_id', type=int)
    channel_id = request.args.get('channel_id', type=int)
    enabled = request.args.get('enabled')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    if enabled is not None:
        enabled = enabled.lower() == 'true'

    service = _get_service()
    result = service.list_subscriptions(
        app_instance_id=app_instance_id,
        channel_id=channel_id,
        enabled=enabled,
        page=page,
        page_size=page_size
    )
    return success(data=result)


@bp.route('', methods=['POST'])
@require_auth
def create_subscription():
    """创建订阅"""
    data = request.get_json()
    user_id = g.user_id

    service = _get_service()
    subscription = service.create_subscription(
        name=data['name'],
        app_instance_id=data['app_instance_id'],
        channel_id=data['channel_id'],
        event_types=data['event_types'],
        filter_conditions=data.get('filter_conditions'),
        delivery_config=data.get('delivery_config'),
        description=data.get('description'),
        created_by=user_id,
        enabled=data.get('enabled', True)
    )
    return created(data=subscription)


@bp.route('/<int:subscription_id>', methods=['GET'])
@require_auth
def get_subscription(subscription_id: int):
    """获取订阅详情"""
    service = _get_service()
    subscription = service.get_subscription(subscription_id)
    return success(data=subscription)


@bp.route('/<int:subscription_id>', methods=['PUT'])
@require_auth
def update_subscription(subscription_id: int):
    """更新订阅"""
    data = request.get_json()

    service = _get_service()
    subscription = service.update_subscription(
        subscription_id=subscription_id,
        name=data.get('name'),
        event_types=data.get('event_types'),
        filter_conditions=data.get('filter_conditions'),
        delivery_config=data.get('delivery_config'),
        description=data.get('description'),
        enabled=data.get('enabled')
    )
    return success(data=subscription)


@bp.route('/<int:subscription_id>', methods=['DELETE'])
@require_auth
def delete_subscription(subscription_id: int):
    """删除订阅"""
    service = _get_service()
    service.delete_subscription(subscription_id)
    return success()


@bp.route('/<int:subscription_id>/enable', methods=['POST'])
@require_auth
def enable_subscription(subscription_id: int):
    """启用订阅"""
    service = _get_service()
    subscription = service.enable_subscription(subscription_id)
    return success(data=subscription)


@bp.route('/<int:subscription_id>/disable', methods=['POST'])
@require_auth
def disable_subscription(subscription_id: int):
    """禁用订阅"""
    service = _get_service()
    subscription = service.disable_subscription(subscription_id)
    return success(data=subscription)


# ============================================================================
# 快捷查询（挂载到 app-instances 下的子路由）
# ============================================================================

app_instance_subscriptions_bp = Blueprint(
    'app_instance_subscriptions_api_v1',
    __name__,
    url_prefix='/api/v1/app-instances'
)


@app_instance_subscriptions_bp.route('/<int:instance_id>/subscriptions', methods=['GET'])
@require_auth
def get_instance_subscriptions(instance_id: int):
    """获取应用实例的所有订阅"""
    service = _get_service()
    subscriptions = service.get_subscriptions_by_app_instance(instance_id)
    return success(data=subscriptions)
