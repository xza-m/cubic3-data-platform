from __future__ import annotations

from flask import Blueprint, g

from app.di.utils import get_app_container
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import server_error, success
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def get_current_user():
    return g.get('user_id', 'admin')


def create_dashboard_blueprint(container=None):
    bp = Blueprint('dashboard_api_v1', __name__, url_prefix='/api/v1/dashboard')

    @bp.route('/overview', methods=['GET'])
    @require_auth
    def get_overview():
        try:
            active_container = container or get_app_container()
            service = active_container.dashboard_overview_service()
            result = service.get_overview(user_id=get_current_user())
            return success(data=result)
        except Exception as exc:
            logger.error(f'Get dashboard overview failed: {exc}', exc_info=True)
            return server_error(message=f'获取工作台概览失败: {exc}')

    return bp


bp = create_dashboard_blueprint()
