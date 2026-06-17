"""全局搜索 API（/api/v1/search）单测。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import jwt
import pytest
from flask import Flask, g

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.search import create_search_blueprint


def _build_app(semantic_service, domain_service, ontology_service) -> Flask:
    app = Flask(__name__)
    app.config.update(TESTING=True, JWT_SECRET='test-secret', DEBUG=True)
    register_error_handlers(app)

    @app.before_request
    def _inject_request_context():
        g.request_id = 'req-test'

    app.register_blueprint(create_search_blueprint(semantic_service, domain_service, ontology_service))
    return app


def _auth_headers(app: Flask) -> dict:
    token = jwt.encode(
        {
            'user_id': 'test_admin',
            'principal_id': 'test_admin',
            'user_name': 'Test Admin',
            'roles': ['admin'],
            'token_use': 'access',
            'sid': 'test-session',
            'jti': 'test-access-token',
            'exp': datetime.now(timezone.utc) + timedelta(hours=1),
        },
        app.config['JWT_SECRET'],
        algorithm='HS256',
    )
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture()
def services():
    semantic_service = MagicMock()
    semantic_service.list_cubes.return_value = [
        {'name': 'orders', 'title': '订单事实', 'description': '订单明细'},
        {'name': 'users', 'title': '用户', 'description': None},
    ]
    domain_service = MagicMock()
    domain_service.list_domains.return_value = [
        {'id': 'd1', 'name': 'order_domain', 'code': 'ORD', 'title': '订单域', 'description': '订单业务'},
    ]
    ontology_service = MagicMock()
    ontology_service.list_metrics.return_value = {
        'items': [
            {'name': 'order_count', 'title': '订单数', 'object_name': 'order'},
            {'name': 'gmv', 'title': '成交额', 'object_name': 'order'},
        ],
        'total': 2,
    }
    return semantic_service, domain_service, ontology_service


def test_search_aggregates_all_types(services):
    app = _build_app(*services)
    client = app.test_client()
    resp = client.get('/api/v1/search?q=order', headers=_auth_headers(app))
    assert resp.status_code == 200
    data = resp.get_json()['data']
    types = {item['type'] for item in data['items']}
    assert types == {'cube', 'domain', 'metric'}
    assert data['total'] == 4  # orders cube + order_domain + order_count + gmv(object_name=order)


def test_search_empty_query_returns_empty(services):
    app = _build_app(*services)
    client = app.test_client()
    resp = client.get('/api/v1/search?q=', headers=_auth_headers(app))
    assert resp.status_code == 200
    assert resp.get_json()['data'] == {'items': [], 'total': 0}


def test_search_filters_by_types_param(services):
    app = _build_app(*services)
    client = app.test_client()
    resp = client.get('/api/v1/search?q=order&types=metric', headers=_auth_headers(app))
    data = resp.get_json()['data']
    assert all(item['type'] == 'metric' for item in data['items'])
    services[0].list_cubes.assert_not_called()
    services[1].list_domains.assert_not_called()


def test_search_respects_limit(services):
    app = _build_app(*services)
    client = app.test_client()
    resp = client.get('/api/v1/search?q=order&limit=1', headers=_auth_headers(app))
    data = resp.get_json()['data']
    assert len(data['items']) == 1
    assert data['total'] == 4


def test_search_degrades_on_provider_failure(services):
    semantic_service, domain_service, ontology_service = services
    semantic_service.list_cubes.side_effect = RuntimeError('boom')
    app = _build_app(semantic_service, domain_service, ontology_service)
    client = app.test_client()
    resp = client.get('/api/v1/search?q=order', headers=_auth_headers(app))
    assert resp.status_code == 200
    types = {item['type'] for item in resp.get_json()['data']['items']}
    assert types == {'domain', 'metric'}


def test_search_requires_auth(services):
    app = _build_app(*services)
    client = app.test_client()
    resp = client.get('/api/v1/search?q=order')
    assert resp.status_code == 401


def test_search_cubes_filtered_by_metadata_visibility(services):
    semantic_service, domain_service, ontology_service = services
    visibility = MagicMock()
    visibility.filter_discoverable_cubes.return_value = [
        {'name': 'orders', 'title': '订单事实', 'description': '订单明细'},
    ]
    app = Flask(__name__)
    app.config.update(TESTING=True, JWT_SECRET='test-secret', DEBUG=True)
    register_error_handlers(app)

    @app.before_request
    def _inject_request_context():
        g.request_id = 'req-test'

    app.register_blueprint(create_search_blueprint(
        semantic_service,
        domain_service,
        ontology_service,
        metadata_visibility_service=visibility,
    ))
    client = app.test_client()

    resp = client.get('/api/v1/search?q=orde&types=cube', headers=_auth_headers(app))
    assert resp.status_code == 200
    items = resp.get_json()['data']['items']
    assert [item['name'] for item in items] == ['orders']
    visibility.filter_discoverable_cubes.assert_called_once()
    principal = visibility.filter_discoverable_cubes.call_args.kwargs['principal']
    assert principal is not None and principal.principal_id == 'test_admin'
