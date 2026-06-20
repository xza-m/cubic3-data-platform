"""
应用市场 API

提供应用定义的查询接口
"""
from flask import Blueprint, request, g

from app.di.container import get_container
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success, not_found, server_error
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

# 创建 Blueprint
bp = Blueprint('apps_api_v1', __name__, url_prefix='/api/v1/apps')


def _get_service():
    """从 DI 容器获取 AppDefinitionService"""
    return get_container().app_definition_service()


@bp.route('', methods=['GET'])
@require_auth
def get_apps():
    """获取应用列表"""
    category = request.args.get('category')
    enabled_only = request.args.get('enabled_only', 'true').lower() == 'true'
    include_stats = request.args.get('include_stats', 'false').lower() == 'true'

    service = _get_service()
    apps = service.get_all_apps(
        category=category,
        enabled_only=enabled_only,
        include_stats=include_stats
    )
    return success(data=apps)


@bp.route('/<string:code>', methods=['GET'])
@require_auth
def get_app(code: str):
    """获取应用详情"""
    service = _get_service()
    app = service.get_app_by_code(code)

    if not app:
        return not_found(message=f"应用 {code} 不存在")

    return success(data=app)


@bp.route('/<string:code>/config-schema', methods=['GET'])
@require_auth
def get_config_schema(code: str):
    """获取应用配置表单 JSON Schema"""
    service = _get_service()
    schema = service.get_config_schema(code)

    if not schema:
        return not_found(message=f"应用 {code} 不存在或未定义配置模板")

    return success(data=schema)


@bp.route('/categories', methods=['GET'])
@require_auth
def get_categories():
    """获取所有应用分类"""
    service = _get_service()
    categories = service.get_categories()
    return success(data=categories)


@bp.route('/<string:code>/validate', methods=['POST'])
@require_auth
def validate_config(code: str):
    """验证应用配置"""
    data = request.get_json()
    config = data.get('config', {})

    service = _get_service()
    is_valid, errors = service.validate_app_config(code, config)

    return success(data={
        'is_valid': is_valid,
        'errors': errors
    })


@bp.route('/<string:code>/enable', methods=['POST'])
@require_auth
def enable_app(code: str):
    """启用应用"""
    service = _get_service()
    app = service.set_enabled(code, True)
    if not app:
        return not_found(message=f"应用 {code} 不存在")
    return success(data=app, message="应用已启用")


@bp.route('/<string:code>/disable', methods=['POST'])
@require_auth
def disable_app(code: str):
    """停用应用"""
    service = _get_service()
    app = service.set_enabled(code, False)
    if not app:
        return not_found(message=f"应用 {code} 不存在")
    return success(data=app, message="应用已停用")
