"""全局搜索 API（F8：CommandPalette 后端 search）

GET /api/v1/search?q=&types=cube,domain,metric&limit=20
聚合语义资产（Cube / Domain / 指标）的关键字匹配，替代前端整列表拉取后客户端过滤。
"""
from flask import Blueprint, g, request

from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import success
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

_DEFAULT_TYPES = ('cube', 'domain', 'metric')
_MAX_LIMIT = 50


def _matches(keyword: str, *values) -> bool:
    return any(keyword in str(value or '').lower() for value in values)


def create_search_blueprint(
    semantic_service,
    domain_modeling_service,
    ontology_service,
    metadata_visibility_service=None,
):
    """Blueprint 工厂：依赖注入便于单测传 Mock。"""
    bp = Blueprint('search', __name__, url_prefix='/api/v1/search')

    def _request_principal():
        """从已认证请求构造可见性裁决主体（JWT 注入的 principal_id + roles）。"""
        from app.application.governance.access import PrincipalContext

        principal_id = getattr(g, 'principal_id', None) or getattr(g, 'user_id', None)
        return PrincipalContext(
            principal_id=str(principal_id) if principal_id else 'anonymous',
            roles=list(getattr(g, 'user_roles', None) or []),
            source='jwt',
        )

    def _search_cubes(keyword):
        try:
            cubes = semantic_service.list_cubes()
        except Exception as exc:
            logger.warning("search_cubes_failed", error=str(exc))
            return []
        # §6.2 metadata visibility：semantic.discover 裁决过滤搜索可见范围
        if metadata_visibility_service is not None:
            cubes = metadata_visibility_service.filter_discoverable_cubes(
                principal=_request_principal(),
                cubes=cubes,
            )
        return [
            {
                'type': 'cube',
                'name': cube.get('name'),
                'title': cube.get('title'),
                'description': cube.get('description'),
            }
            for cube in cubes
            if _matches(keyword, cube.get('name'), cube.get('title'), cube.get('description'))
        ]

    def _search_domains(keyword):
        try:
            domains = domain_modeling_service.list_domains()
        except Exception as exc:
            logger.warning("search_domains_failed", error=str(exc))
            return []
        return [
            {
                'type': 'domain',
                'id': domain.get('id') or domain.get('code') or domain.get('name'),
                'name': domain.get('name'),
                'title': domain.get('title') or domain.get('name'),
                'description': domain.get('description'),
            }
            for domain in domains
            if _matches(keyword, domain.get('name'), domain.get('code'), domain.get('description'))
        ]

    def _search_metrics(keyword):
        try:
            payload = ontology_service.list_metrics()
            metrics = payload.get('items') if isinstance(payload, dict) else payload
        except Exception as exc:
            logger.warning("search_metrics_failed", error=str(exc))
            return []
        return [
            {
                'type': 'metric',
                'name': metric.get('name'),
                'title': metric.get('title'),
                'object_name': metric.get('object_name'),
            }
            for metric in (metrics or [])
            if _matches(keyword, metric.get('name'), metric.get('title'), metric.get('object_name'))
        ]

    @bp.route('', methods=['GET'])
    @require_auth
    def global_search():
        keyword = (request.args.get('q') or '').strip().lower()
        raw_types = (request.args.get('types') or '').strip()
        types = [item for item in raw_types.split(',') if item] if raw_types else list(_DEFAULT_TYPES)
        try:
            limit = int(request.args.get('limit') or 20)
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, _MAX_LIMIT))

        if not keyword:
            return success(data={'items': [], 'total': 0})

        items = []
        if 'cube' in types:
            items.extend(_search_cubes(keyword))
        if 'domain' in types:
            items.extend(_search_domains(keyword))
        if 'metric' in types:
            items.extend(_search_metrics(keyword))

        return success(data={'items': items[:limit], 'total': len(items)})

    return bp
