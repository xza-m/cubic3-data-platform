from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io
from types import SimpleNamespace
from unittest.mock import MagicMock

import jwt
import pytest
from flask import Flask, g

from app.domain.entities.sql_query import SQLQueryStatus
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1 import app_executions as app_executions_api
from app.interfaces.api.v1 import app_instances as app_instances_api
from app.interfaces.api.v1 import apps as apps_api
from app.interfaces.api.v1 import auth as auth_api
from app.interfaces.api.v1 import channels as channels_api
from app.interfaces.api.v1 import dashboard as dashboard_api
from app.interfaces.api.v1 import conversations as conversations_api
from app.interfaces.api.v1 import datasources as datasources_api
from app.interfaces.api.v1 import extraction as extraction_api
from app.interfaces.api.v1 import feishu as feishu_api
from app.interfaces.api.v1 import files as files_api
from app.interfaces.api.v1 import queries as queries_api
from app.interfaces.api.v1 import semantic as semantic_api
from app.interfaces.api.v1 import sql_lab as sql_lab_api
from app.interfaces.api.v1 import subscriptions as subscriptions_api
from app.interfaces.api.v1.datasets import create_datasets_blueprint
from app.interfaces.api.v1.semantic import create_semantic_blueprint
from app.shared.exceptions import ApplicationException, EntityNotFoundError, ValidationError as AppValidationError


def build_app(*blueprints) -> Flask:
    app = Flask(__name__)
    app.config.update(TESTING=True, JWT_SECRET='test-secret', DEBUG=True)
    register_error_handlers(app)

    @app.before_request
    def _inject_request_context():
        g.request_id = 'req-test'

    for blueprint in blueprints:
        app.register_blueprint(blueprint)
    return app


def _install_admin_auth(client):
    """在 test client 上安装默认 admin Bearer Header（按 app 的实际 JWT_SECRET 签名）。

    用于"自建 Flask app 调用受保护路由但又不显式传 headers"的旧测试。
    """
    secret = client.application.config.get('JWT_SECRET', 'your-secret-key')
    token = jwt.encode(
        {
            'user_id': 'test_admin',
            'user_name': 'Test Admin',
            'roles': ['admin', 'tester'],
            'exp': datetime.now(timezone.utc) + timedelta(hours=1),
        },
        secret,
        algorithm='HS256',
    )
    client.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    return client


def auth_headers(user_id: str = 'tester', roles: list[str] | None = None) -> dict[str, str]:
    """生成测试用 Bearer Header。

    默认角色 ``['admin', 'tester']`` —— 保证可同时通过 ``@require_auth`` 与
    ``@require_admin``。需要测试无 admin 权限场景时显式传入 ``roles=['tester']``。
    """
    token = jwt.encode(
        {
            'user_id': user_id,
            'user_name': 'Test User',
            'roles': roles if roles is not None else ['admin', 'tester'],
            'exp': datetime.now(timezone.utc) + timedelta(hours=1),
        },
        'test-secret',
        algorithm='HS256',
    )
    return {'Authorization': f'Bearer {token}'}


def auth_headers_with_principal(
    *,
    user_id: str = 'legacy-user',
    principal_id: str = 'feishu:tenant:on_current',
    roles: list[str] | None = None,
) -> dict[str, str]:
    """生成同时包含 legacy user_id 与新 Principal ID 的测试 Header。"""
    token = jwt.encode(
        {
            'user_id': user_id,
            'principal_id': principal_id,
            'user_name': 'Test User',
            'roles': roles if roles is not None else ['admin', 'tester'],
            'exp': datetime.now(timezone.utc) + timedelta(hours=1),
        },
        'test-secret',
        algorithm='HS256',
    )
    return {'Authorization': f'Bearer {token}'}


def attach_handler(container: MagicMock, factory_name: str, result=None, side_effect=None) -> MagicMock:
    handler = MagicMock()
    if side_effect is not None:
        handler.handle.side_effect = side_effect
    else:
        handler.handle.return_value = result
    getattr(container, factory_name).return_value = handler
    return handler


class FakeAsyncQuery:
    def __init__(
        self,
        *,
        status: str,
        result: dict | None = None,
        error_message: str | None = None,
    ) -> None:
        self.id = 99
        self.source_id = 1
        self.status = status
        self.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.started_at = None
        self.completed_at = None
        self.execution_time_ms = None
        self.row_count = 0
        self.error_message = error_message
        self.created_by = 'tester'
        self.result = result

    def is_finished(self) -> bool:
        return self.status in {SQLQueryStatus.COMPLETED, SQLQueryStatus.FAILED}

    def to_dict(self, include_result: bool = False) -> dict:
        data = {
            'id': self.id,
            'source_id': self.source_id,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'execution_time_ms': self.execution_time_ms,
            'row_count': self.row_count,
            'error_message': self.error_message,
            'created_by': self.created_by,
        }
        if include_result and self.result is not None:
            data['result'] = self.result
        return data


def test_queries_routes_cover_success_and_error_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(queries_api, 'get_app_container', lambda: container)

    attach_handler(container, 'execute_query_handler', result={'rows': [[1]], 'columns': ['value']})
    list_queries_handler = attach_handler(container, 'list_queries_handler', result={'items': [], 'total': 0})
    create_query_handler = attach_handler(
        container,
        'create_query_handler',
        result=SimpleNamespace(id=1, query_code='q_001', query_name='周报'),
    )
    attach_handler(container, 'get_query_handler', side_effect=EntityNotFoundError('query not found'))
    attach_handler(container, 'update_query_handler', result=SimpleNamespace(id=2, query_name='已更新'))
    attach_handler(container, 'delete_query_handler', result=None)
    attach_handler(container, 'toggle_favorite_handler', result={'is_favorite': True})
    list_folders_handler = attach_handler(container, 'list_folders_handler', result=[{'id': 1, 'folder_name': '默认'}])
    create_folder_handler = attach_handler(container, 'create_folder_handler', result={'id': 3, 'folder_name': '报表'})
    list_histories_handler = attach_handler(container, 'list_histories_handler', result={'items': [], 'total': 0})
    attach_handler(container, 'get_statistics_handler', result={'queries': 12, 'favorites': 3})
    list_templates_handler = attach_handler(container, 'list_templates_handler', result={'items': [], 'total': 0})
    create_template_handler = attach_handler(container, 'create_template_handler', result={'id': 10})
    attach_handler(container, 'get_template_handler', result={'id': 10, 'template_name': '模板'})
    update_template_handler = attach_handler(container, 'update_template_handler', result={'id': 10, 'template_name': '更新模板'})
    attach_handler(container, 'delete_template_handler', result=None)
    attach_handler(container, 'use_template_handler', result={'sql_query': 'SELECT 1'})

    client = build_app(queries_api.bp).test_client()
    headers = auth_headers()

    execute_resp = client.post(
        '/api/v1/queries/execute',
        json={'source_id': 7, 'sql_query': 'SELECT 1', 'limit': 50},
        headers=headers,
    )
    assert execute_resp.status_code == 200
    execute_command = container.execute_query_handler.return_value.handle.call_args.args[0]
    assert execute_command.source_id == 7
    assert execute_command.executed_by == 'tester'

    list_resp = client.get(
        '/api/v1/queries?page=2&page_size=5&folder_id=9&is_favorite=true&search=订单',
        headers=headers,
    )
    assert list_resp.status_code == 200
    assert list_queries_handler.handle.call_args.kwargs == {
        'page': 2,
        'page_size': 5,
        'folder_id': 9,
        'is_favorite': True,
        'search': '订单',
        'created_by': 'tester',
    }

    create_resp = client.post(
        '/api/v1/queries',
        json={'query_name': '周报', 'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    )
    assert create_resp.status_code == 201
    assert create_resp.get_json()['data']['query_code'] == 'q_001'
    assert create_query_handler.handle.call_args.args[0].created_by == 'tester'

    get_resp = client.get('/api/v1/queries/42', headers=headers)
    assert get_resp.status_code == 404

    update_resp = client.put(
        '/api/v1/queries/2',
        json={'query_name': '已更新', 'sql_query': 'SELECT 2'},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.get_json()['data']['query_name'] == '已更新'

    delete_resp = client.delete('/api/v1/queries/2', headers=headers)
    assert delete_resp.status_code == 200
    assert container.delete_query_handler.return_value.handle.call_args.kwargs == {'query_id': 2}

    favorite_resp = client.post('/api/v1/queries/2/favorite', headers=headers)
    assert favorite_resp.status_code == 200
    assert favorite_resp.get_json()['data']['is_favorite'] is True

    folders_resp = client.get('/api/v1/queries/folders', headers=headers)
    assert folders_resp.status_code == 200
    assert list_folders_handler.handle.call_args.kwargs == {'created_by': 'tester'}

    create_folder_resp = client.post(
        '/api/v1/queries/folders',
        json={'folder_name': '报表', 'parent_id': 1},
        headers=headers,
    )
    assert create_folder_resp.status_code == 201
    assert create_folder_handler.handle.call_args.kwargs == {
        'folder_name': '报表',
        'parent_id': 1,
        'created_by': 'tester',
    }

    histories_resp = client.get(
        '/api/v1/queries/histories?page=3&page_size=10&query_id=4&source_id=5&status=success&date_from=2026-01-01&date_to=2026-01-31',
        headers=headers,
    )
    assert histories_resp.status_code == 200
    assert list_histories_handler.handle.call_args.kwargs == {
        'page': 3,
        'page_size': 10,
        'query_id': 4,
        'source_id': 5,
        'status': 'success',
        'executed_by': 'tester',
        'date_from': '2026-01-01',
        'date_to': '2026-01-31',
    }

    statistics_resp = client.get('/api/v1/queries/statistics', headers=headers)
    assert statistics_resp.status_code == 200
    assert statistics_resp.get_json()['data']['queries'] == 12

    list_templates_resp = client.get('/api/v1/queries/templates?page=2&page_size=5&category=运营&search=模板', headers=headers)
    assert list_templates_resp.status_code == 200
    assert list_templates_handler.handle.call_args.kwargs == {
        'page': 2,
        'per_page': 5,
        'category': '运营',
        'search': '模板',
    }

    create_template_resp = client.post(
        '/api/v1/queries/templates',
        json={'template_name': '模板', 'sql_template': 'SELECT {{ ds }}', 'parameters': [{'name': 'ds'}], 'tags': ['daily']},
        headers=headers,
    )
    assert create_template_resp.status_code == 201
    assert create_template_handler.handle.call_args.kwargs['created_by'] == 'tester'

    get_template_resp = client.get('/api/v1/queries/templates/10', headers=headers)
    assert get_template_resp.status_code == 200

    update_template_resp = client.put(
        '/api/v1/queries/templates/10',
        json={'template_name': '更新模板', 'sql_template': 'SELECT 2', 'ignored': 'x'},
        headers=headers,
    )
    assert update_template_resp.status_code == 200
    assert update_template_handler.handle.call_args.kwargs == {
        'template_id': 10,
        'updated_by': 'tester',
        'template_name': '更新模板',
        'sql_template': 'SELECT 2',
    }

    delete_template_resp = client.delete('/api/v1/queries/templates/10', headers=headers)
    assert delete_template_resp.status_code == 200

    use_template_resp = client.post('/api/v1/queries/templates/10/use', json={'ds': '2026-03-24'}, headers=headers)
    assert use_template_resp.status_code == 200

    invalid_execute_resp = client.post('/api/v1/queries/execute', json={'sql_query': 'SELECT 1'}, headers=headers)
    assert invalid_execute_resp.status_code == 400

    container.execute_query_handler.return_value.handle.side_effect = ApplicationException('执行失败')
    app_error_resp = client.post(
        '/api/v1/queries/execute',
        json={'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    )
    assert app_error_resp.status_code == 400

    container.create_query_handler.return_value.handle.side_effect = AppValidationError('名称重复')
    duplicate_resp = client.post(
        '/api/v1/queries',
        json={'query_name': '重复', 'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    )
    assert duplicate_resp.status_code == 400


def test_queries_routes_prefer_principal_identity_over_legacy_user_id(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(queries_api, 'get_app_container', lambda: container)

    attach_handler(container, 'execute_query_handler', result={'rows': [[1]], 'columns': ['value']})
    list_queries_handler = attach_handler(container, 'list_queries_handler', result={'items': [], 'total': 0})
    create_query_handler = attach_handler(
        container,
        'create_query_handler',
        result=SimpleNamespace(id=1, query_code='q_001', query_name='周报'),
    )
    list_folders_handler = attach_handler(container, 'list_folders_handler', result=[])
    list_histories_handler = attach_handler(container, 'list_histories_handler', result={'items': [], 'total': 0})

    client = build_app(queries_api.bp).test_client()
    headers = auth_headers_with_principal(
        user_id='legacy-user-001',
        principal_id='feishu:tenant:on_current',
    )

    execute_resp = client.post(
        '/api/v1/queries/execute',
        json={'source_id': 7, 'sql_query': 'SELECT 1', 'limit': 50},
        headers=headers,
    )
    assert execute_resp.status_code == 200
    execute_command = container.execute_query_handler.return_value.handle.call_args.args[0]
    assert execute_command.executed_by == 'feishu:tenant:on_current'

    list_resp = client.get('/api/v1/queries', headers=headers)
    assert list_resp.status_code == 200
    assert list_queries_handler.handle.call_args.kwargs['created_by'] == 'feishu:tenant:on_current'

    create_resp = client.post(
        '/api/v1/queries',
        json={'query_name': '周报', 'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    )
    assert create_resp.status_code == 201
    assert create_query_handler.handle.call_args.args[0].created_by == 'feishu:tenant:on_current'

    folders_resp = client.get('/api/v1/queries/folders', headers=headers)
    assert folders_resp.status_code == 200
    assert list_folders_handler.handle.call_args.kwargs['created_by'] == 'feishu:tenant:on_current'

    histories_resp = client.get('/api/v1/queries/histories', headers=headers)
    assert histories_resp.status_code == 200
    assert list_histories_handler.handle.call_args.kwargs['executed_by'] == 'feishu:tenant:on_current'


def test_queries_routes_reject_body_principal_mismatch(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(queries_api, 'get_app_container', lambda: container)

    execute_handler = attach_handler(container, 'execute_query_handler', result={'rows': [[1]], 'columns': ['value']})
    create_handler = attach_handler(
        container,
        'create_query_handler',
        result=SimpleNamespace(id=1, query_code='q_001', query_name='周报'),
    )

    client = build_app(queries_api.bp).test_client()
    headers = auth_headers_with_principal(
        user_id='legacy-user-001',
        principal_id='feishu:tenant:on_current',
    )

    execute_resp = client.post(
        '/api/v1/queries/execute',
        json={
            'source_id': 7,
            'sql_query': 'SELECT 1',
            'principal_id': 'feishu:tenant:on_other',
        },
        headers=headers,
    )
    assert execute_resp.status_code == 403
    assert execute_handler.handle.call_count == 0

    create_resp = client.post(
        '/api/v1/queries',
        json={
            'query_name': '周报',
            'source_id': 1,
            'sql_query': 'SELECT 1',
            'principal_id': 'feishu:tenant:on_other',
        },
        headers=headers,
    )
    assert create_resp.status_code == 403
    assert create_handler.handle.call_count == 0


def test_queries_routes_cover_validation_and_exception_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(queries_api, 'get_app_container', lambda: container)
    monkeypatch.setattr(queries_api.logger, 'error', MagicMock())

    execute_handler = attach_handler(container, 'execute_query_handler', result={'rows': []})
    list_queries_handler = attach_handler(container, 'list_queries_handler', result={'items': [], 'total': 0})
    create_query_handler = attach_handler(container, 'create_query_handler', result=SimpleNamespace(id=1, query_code='q', query_name='q'))
    get_query_handler = attach_handler(container, 'get_query_handler', result={'id': 1})
    update_query_handler = attach_handler(container, 'update_query_handler', result=SimpleNamespace(id=1, query_name='updated'))
    delete_query_handler = attach_handler(container, 'delete_query_handler', result=None)
    toggle_favorite_handler = attach_handler(container, 'toggle_favorite_handler', result={'is_favorite': False})
    list_folders_handler = attach_handler(container, 'list_folders_handler', result=[])
    create_folder_handler = attach_handler(container, 'create_folder_handler', result={'id': 1})
    list_histories_handler = attach_handler(container, 'list_histories_handler', result={'items': [], 'total': 0})
    statistics_handler = attach_handler(container, 'get_statistics_handler', result={'queries': 0})
    list_templates_handler = attach_handler(container, 'list_templates_handler', result={'items': [], 'total': 0})
    create_template_handler = attach_handler(container, 'create_template_handler', result={'id': 1})
    get_template_handler = attach_handler(container, 'get_template_handler', result={'id': 1})
    update_template_handler = attach_handler(container, 'update_template_handler', result={'id': 1})
    delete_template_handler = attach_handler(container, 'delete_template_handler', result=None)
    use_template_handler = attach_handler(container, 'use_template_handler', result={'sql_query': 'SELECT 1'})

    client = build_app(queries_api.bp).test_client()
    headers = auth_headers()

    assert client.post('/api/v1/queries/execute', json={}, headers=headers).status_code == 400

    execute_handler.handle.side_effect = ApplicationException('app failed')
    assert client.post(
        '/api/v1/queries/execute',
        json={'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    ).status_code == 400

    execute_handler.handle.side_effect = RuntimeError('db down')
    assert client.post(
        '/api/v1/queries/execute',
        json={'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    ).status_code == 500

    list_queries_handler.handle.side_effect = RuntimeError('list down')
    assert client.get('/api/v1/queries', headers=headers).status_code == 500

    assert client.post('/api/v1/queries', json={'source_id': 1}, headers=headers).status_code == 400

    create_query_handler.handle.side_effect = AppValidationError('duplicate query')
    assert client.post(
        '/api/v1/queries',
        json={'query_name': '周报', 'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    ).status_code == 400

    create_query_handler.handle.side_effect = RuntimeError('create failed')
    assert client.post(
        '/api/v1/queries',
        json={'query_name': '周报', 'source_id': 1, 'sql_query': 'SELECT 1'},
        headers=headers,
    ).status_code == 500

    get_query_handler.handle.side_effect = RuntimeError('detail failed')
    assert client.get('/api/v1/queries/1', headers=headers).status_code == 500

    assert client.put('/api/v1/queries/1', json={'folder_id': 'invalid'}, headers=headers).status_code == 400

    update_query_handler.handle.side_effect = EntityNotFoundError('missing query')
    assert client.put(
        '/api/v1/queries/1',
        json={'query_name': 'x', 'sql_query': 'SELECT 2'},
        headers=headers,
    ).status_code == 404

    update_query_handler.handle.side_effect = RuntimeError('update failed')
    assert client.put(
        '/api/v1/queries/1',
        json={'query_name': 'x', 'sql_query': 'SELECT 2'},
        headers=headers,
    ).status_code == 500

    delete_query_handler.handle.side_effect = EntityNotFoundError('missing query')
    assert client.delete('/api/v1/queries/1', headers=headers).status_code == 404

    delete_query_handler.handle.side_effect = RuntimeError('delete failed')
    assert client.delete('/api/v1/queries/1', headers=headers).status_code == 500

    toggle_favorite_handler.handle.side_effect = EntityNotFoundError('missing query')
    assert client.post('/api/v1/queries/1/favorite', headers=headers).status_code == 404

    toggle_favorite_handler.handle.side_effect = RuntimeError('favorite failed')
    assert client.post('/api/v1/queries/1/favorite', headers=headers).status_code == 500

    list_folders_handler.handle.side_effect = RuntimeError('folder list failed')
    assert client.get('/api/v1/queries/folders', headers=headers).status_code == 500

    assert client.post('/api/v1/queries/folders', json={}, headers=headers).status_code == 400

    create_folder_handler.handle.side_effect = RuntimeError('folder create failed')
    assert client.post(
        '/api/v1/queries/folders',
        json={'folder_name': '报表'},
        headers=headers,
    ).status_code == 500

    list_histories_handler.handle.side_effect = RuntimeError('histories failed')
    assert client.get('/api/v1/queries/histories', headers=headers).status_code == 500

    statistics_handler.handle.side_effect = RuntimeError('statistics failed')
    assert client.get('/api/v1/queries/statistics', headers=headers).status_code == 500

    list_templates_handler.handle.side_effect = RuntimeError('templates failed')
    assert client.get('/api/v1/queries/templates', headers=headers).status_code == 500

    create_template_handler.handle.side_effect = AppValidationError('bad template')
    assert client.post(
        '/api/v1/queries/templates',
        json={'template_name': '模板', 'sql_template': 'SELECT 1'},
        headers=headers,
    ).status_code == 400

    create_template_handler.handle.side_effect = RuntimeError('template create failed')
    assert client.post(
        '/api/v1/queries/templates',
        json={'template_name': '模板', 'sql_template': 'SELECT 1'},
        headers=headers,
    ).status_code == 500

    get_template_handler.handle.side_effect = EntityNotFoundError('missing template')
    assert client.get('/api/v1/queries/templates/1', headers=headers).status_code == 404

    get_template_handler.handle.side_effect = RuntimeError('template detail failed')
    assert client.get('/api/v1/queries/templates/1', headers=headers).status_code == 500

    update_template_handler.handle.side_effect = EntityNotFoundError('missing template')
    assert client.put(
        '/api/v1/queries/templates/1',
        json={'template_name': 'new'},
        headers=headers,
    ).status_code == 404

    update_template_handler.handle.side_effect = RuntimeError('template update failed')
    assert client.put(
        '/api/v1/queries/templates/1',
        json={'template_name': 'new'},
        headers=headers,
    ).status_code == 500

    delete_template_handler.handle.side_effect = EntityNotFoundError('missing template')
    assert client.delete('/api/v1/queries/templates/1', headers=headers).status_code == 404

    delete_template_handler.handle.side_effect = RuntimeError('template delete failed')
    assert client.delete('/api/v1/queries/templates/1', headers=headers).status_code == 500

    use_template_handler.handle.side_effect = EntityNotFoundError('missing template')
    assert client.post('/api/v1/queries/templates/1/use', json={}, headers=headers).status_code == 404

    use_template_handler.handle.side_effect = RuntimeError('template use failed')
    assert client.post('/api/v1/queries/templates/1/use', json={}, headers=headers).status_code == 500


def test_queries_get_query_success_branch(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(queries_api, 'get_app_container', lambda: container)
    attach_handler(container, 'get_query_handler', result={'id': 7, 'query_name': '查询详情'})

    client = build_app(queries_api.bp).test_client()
    resp = client.get('/api/v1/queries/7', headers=auth_headers())

    assert resp.status_code == 200
    assert resp.get_json()['data']['query_name'] == '查询详情'


def test_dashboard_overview_route_covers_auth_and_shape(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(dashboard_api, 'get_app_container', lambda: container)

    dashboard_service = MagicMock()
    dashboard_service.get_overview.return_value = {
        'stats': {
            'datasource_total': 3,
            'dataset_total': 7,
            'today_query_count': 2,
            'ai_chat_count': None,
        },
        'recent_queries': [
            {'id': idx, 'sql_query': f'SELECT {idx}', 'status': 'success'}
            for idx in range(1, 6)
        ],
        'health': {
            'datasource_connectivity': 66.7,
            'semantic_coverage': None,
            'query_success_rate': 75.0,
        },
        'trends': {
            'datasource_month_delta': 1,
            'dataset_week_delta': -2,
            'query_count_week': 12,
        },
    }
    container.dashboard_overview_service.return_value = dashboard_service

    client = build_app(dashboard_api.create_dashboard_blueprint(container)).test_client()

    unauthorized = client.get('/api/v1/dashboard/overview')
    assert unauthorized.status_code == 401

    response = client.get('/api/v1/dashboard/overview', headers=auth_headers())
    assert response.status_code == 200
    payload = response.get_json()['data']
    assert payload['stats']['ai_chat_count'] is None
    assert payload['health']['semantic_coverage'] is None
    assert len(payload['recent_queries']) == 5
    dashboard_service.get_overview.assert_called_once_with(user_id='tester')


def test_datasources_routes_cover_success_and_validation_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(datasources_api, 'get_app_container', lambda: container)

    datasource_obj = MagicMock()
    datasource_obj.to_dict.return_value = {'id': 1, 'name': 'Warehouse'}
    attach_handler(
        container,
        'list_datasources_handler',
        result={'items': [datasource_obj], 'total': 1, 'page': 1, 'page_size': 20, 'total_pages': 1},
    )
    attach_handler(container, 'get_datasource_handler', result=datasource_obj)
    create_handler = attach_handler(container, 'create_datasource_handler', result=datasource_obj)
    update_handler = attach_handler(container, 'update_datasource_handler', result=datasource_obj)
    attach_handler(container, 'delete_datasource_handler', result=None)
    test_connection_handler = attach_handler(container, 'test_connection_handler', result={'success': True})
    databases_handler = attach_handler(container, 'get_databases_handler', result=['dw'])
    tables_handler = attach_handler(container, 'get_tables_handler', result=([{'name': 'orders'}], {'cache': False}))
    schemas_handler = attach_handler(container, 'get_schemas_handler', result=['public'])
    table_schema_handler = attach_handler(container, 'get_table_schema_handler', result={'columns': ['id']})
    attach_handler(container, 'get_datasource_statistics_handler', result={'total': 3, 'active': 2})
    preview_handler = attach_handler(container, 'preview_table_data_handler', result={'rows': [{'id': 1}]})
    container.task_queue.return_value.enqueue.return_value = SimpleNamespace(id='job-1')

    client = build_app(datasources_api.bp).test_client()
    headers = auth_headers()

    list_resp = client.get(
        '/api/v1/data-center/datasources?source_type=postgresql&is_active=true&search=dw&page=2&page_size=30',
        headers=headers,
    )
    assert list_resp.status_code == 200
    query = container.list_datasources_handler.return_value.handle.call_args.args[0]
    assert query.source_type == 'postgresql'
    assert query.is_active is True
    assert query.page == 2
    datasource_obj.to_dict.assert_called_with(mask_sensitive=True)

    get_resp = client.get('/api/v1/data-center/datasources/1', headers=headers)
    assert get_resp.status_code == 200

    invalid_create_resp = client.post(
        '/api/v1/data-center/datasources',
        json={'name': 'bad', 'source_type': 'oracle', 'connection_config': {}},
        headers=headers,
    )
    assert invalid_create_resp.status_code == 400

    create_resp = client.post(
        '/api/v1/data-center/datasources',
        json={'name': 'Warehouse', 'source_type': 'postgresql', 'connection_config': {'host': 'db'}},
        headers=headers,
    )
    assert create_resp.status_code == 201
    assert create_handler.handle.call_args.args[0].created_by == 'tester'

    update_resp = client.put(
        '/api/v1/data-center/datasources/1',
        json={'name': 'Warehouse v2', 'is_active': False},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_handler.handle.call_args.args[0].datasource_id == 1

    delete_resp = client.delete('/api/v1/data-center/datasources/1', headers=headers)
    assert delete_resp.status_code == 200

    test_resp = client.post('/api/v1/data-center/datasources/1/test', headers=headers)
    assert test_resp.status_code == 200
    assert test_connection_handler.handle.call_args.args[0].datasource_id == 1

    databases_resp = client.get('/api/v1/data-center/datasources/1/databases', headers=headers)
    assert databases_resp.status_code == 200
    assert databases_handler.handle.call_args.args[0].datasource_id == 1

    missing_database_resp = client.get('/api/v1/data-center/datasources/1/tables', headers=headers)
    assert missing_database_resp.status_code == 400

    tables_resp = client.get('/api/v1/data-center/datasources/1/tables?database=dw&force_refresh=true', headers=headers)
    assert tables_resp.status_code == 200
    tables_query = tables_handler.handle.call_args.args[0]
    assert tables_query.database == 'dw'
    assert tables_query.force_refresh is True

    missing_schema_database_resp = client.get('/api/v1/data-center/datasources/1/schemas', headers=headers)
    assert missing_schema_database_resp.status_code == 400

    schemas_resp = client.get('/api/v1/data-center/datasources/1/schemas?database=dw', headers=headers)
    assert schemas_resp.status_code == 200
    assert schemas_handler.handle.call_args.args[0].database == 'dw'

    missing_table_schema_resp = client.get('/api/v1/data-center/datasources/1/table-schema?database=dw', headers=headers)
    assert missing_table_schema_resp.status_code == 400

    table_schema_resp = client.get('/api/v1/data-center/datasources/1/table-schema?database=dw&table=orders&schema=public', headers=headers)
    assert table_schema_resp.status_code == 200
    schema_query = table_schema_handler.handle.call_args.args[0]
    assert schema_query.table == 'orders'
    assert schema_query.schema == 'public'

    statistics_resp = client.get('/api/v1/data-center/datasources/statistics', headers=headers)
    assert statistics_resp.status_code == 200

    monkeypatch.setattr(AdapterFactory, 'get_supported_types', staticmethod(lambda: ['postgresql', 'custom']))
    types_resp = client.get('/api/v1/data-center/datasources/types', headers=headers)
    assert types_resp.status_code == 200
    types_data = types_resp.get_json()['data']
    assert {'type': 'custom', 'display_name': 'custom', 'description': ''} in types_data

    missing_preview_database_resp = client.get('/api/v1/data-center/datasources/1/tables/orders/preview', headers=headers)
    assert missing_preview_database_resp.status_code == 400

    preview_resp = client.get('/api/v1/data-center/datasources/1/tables/orders/preview?database=dw&limit=999', headers=headers)
    assert preview_resp.status_code == 200
    preview_query = preview_handler.handle.call_args.args[0]
    assert preview_query.limit == 100

    sync_catalog_resp = client.post('/api/v1/data-center/datasources/1/sync-catalog', headers=headers)
    assert sync_catalog_resp.status_code == 200
    assert sync_catalog_resp.get_json()['data'] == {'job_id': 'job-1', 'status': 'queued'}

    container.get_datasource_handler.return_value.handle.side_effect = EntityNotFoundError('datasource not found')
    invalid_sync_catalog_resp = client.post('/api/v1/data-center/datasources/999/sync-catalog', headers=headers)
    assert invalid_sync_catalog_resp.status_code == 404


def test_datasets_routes_cover_generation_and_error_paths(monkeypatch):
    container = MagicMock()
    dataset_obj = MagicMock()
    dataset_obj.to_dict.return_value = {'id': 11, 'dataset_code': 'pg_orders_001'}
    attach_handler(
        container,
        'list_datasets_handler',
        result={'items': [dataset_obj], 'total': 1, 'page': 1, 'page_size': 20, 'total_pages': 1},
    )
    attach_handler(container, 'get_dataset_handler', result=dataset_obj)
    create_handler = attach_handler(container, 'create_dataset_handler', result=dataset_obj)
    attach_handler(container, 'update_dataset_handler', result=dataset_obj)
    attach_handler(container, 'delete_dataset_handler', result=None)
    attach_handler(container, 'sync_schema_handler', result={'job_id': 'job-1', 'status': 'queued'})
    attach_handler(container, 'preview_dataset_handler', result={'fields': [{'name': 'id'}]})
    attach_handler(container, 'get_dataset_statistics_handler', result={'total': 8})
    container.datasource_repository.return_value.find_by_id.return_value = SimpleNamespace(source_type='postgresql')
    monkeypatch.setattr('app.shared.utils.code_generator.generate_dataset_code', lambda *args, **kwargs: 'pg_orders_123')

    client = build_app(create_datasets_blueprint(container)).test_client()
    headers = auth_headers()
    create_payload = {
        'dataset_code': 'dw_orders',
        'dataset_name': '订单数据集',
        'source_id': 1,
        'physical_table': 'dw.orders',
        'fields': [{'physical_name': 'id', 'data_type': 'bigint'}],
    }

    list_resp = client.get('/api/v1/data-center/datasets', headers=headers)
    assert list_resp.status_code == 200

    get_resp = client.get('/api/v1/data-center/datasets/11?include_fields=true', headers=headers)
    assert get_resp.status_code == 200
    dataset_obj.to_dict.assert_any_call(include_fields=True)

    create_resp = client.post('/api/v1/data-center/datasets', json=create_payload, headers=headers)
    assert create_resp.status_code == 201
    assert create_handler.handle.call_args.args[0].dataset_code == 'dw_orders'

    auto_code_resp = client.post(
        '/api/v1/data-center/datasets',
        json={k: v for k, v in create_payload.items() if k != 'dataset_code'},
        headers=headers,
    )
    assert auto_code_resp.status_code == 201
    assert create_handler.handle.call_args.args[0].dataset_code == 'pg_orders_123'

    container.datasource_repository.return_value.find_by_id.return_value = None
    missing_datasource_resp = client.post(
        '/api/v1/data-center/datasets',
        json={k: v for k, v in create_payload.items() if k != 'dataset_code'},
        headers=headers,
    )
    assert missing_datasource_resp.status_code == 500

    update_resp = client.put(
        '/api/v1/data-center/datasets/11',
        json={'dataset_name': '订单数据集 v2', 'owner': 'alice'},
        headers=headers,
    )
    assert update_resp.status_code == 200

    delete_resp = client.delete('/api/v1/data-center/datasets/11', headers=headers)
    assert delete_resp.status_code == 200

    sync_resp = client.post('/api/v1/data-center/datasets/11/sync-schema', headers=headers)
    assert sync_resp.status_code == 200
    assert sync_resp.get_json()['data'] == {'job_id': 'job-1', 'status': 'queued'}

    invalid_preview_resp = client.post('/api/v1/data-center/datasets/preview', json={'database': 'dw'}, headers=headers)
    assert invalid_preview_resp.status_code == 400

    preview_resp = client.post(
        '/api/v1/data-center/datasets/preview',
        json={'datasource_id': 1, 'database': 'dw', 'table': 'orders'},
        headers=headers,
    )
    assert preview_resp.status_code == 200

    statistics_resp = client.get('/api/v1/data-center/datasets/statistics', headers=headers)
    assert statistics_resp.status_code == 200


def test_datasource_and_dataset_routes_cover_remaining_validation_branches(monkeypatch):
    datasource_container = MagicMock()
    monkeypatch.setattr(datasources_api, 'get_app_container', lambda: datasource_container)
    datasource_obj = MagicMock()
    datasource_obj.to_dict.return_value = {'id': 1, 'name': 'Warehouse'}
    attach_handler(datasource_container, 'update_datasource_handler', result=datasource_obj)
    attach_handler(datasource_container, 'get_table_schema_handler', result={'columns': []})

    datasource_client = build_app(datasources_api.bp).test_client()
    headers = auth_headers()

    invalid_update_resp = datasource_client.put(
        '/api/v1/data-center/datasources/1',
        json={'name': ''},
        headers=headers,
    )
    assert invalid_update_resp.status_code == 400

    missing_database_resp = datasource_client.get(
        '/api/v1/data-center/datasources/1/table-schema?table=orders',
        headers=headers,
    )
    assert missing_database_resp.status_code == 400

    dataset_container = MagicMock()
    dataset_obj = MagicMock()
    dataset_obj.to_dict.return_value = {'id': 11, 'dataset_code': 'orders'}
    attach_handler(dataset_container, 'create_dataset_handler', result=dataset_obj)
    attach_handler(dataset_container, 'update_dataset_handler', result=dataset_obj)
    dataset_client = build_app(create_datasets_blueprint(dataset_container)).test_client()

    invalid_create_resp = dataset_client.post(
        '/api/v1/data-center/datasets',
        json={'dataset_name': '坏数据集', 'fields': []},
        headers=headers,
    )
    assert invalid_create_resp.status_code == 400

    invalid_dataset_update_resp = dataset_client.put(
        '/api/v1/data-center/datasets/11',
        json={'dataset_name': ''},
        headers=headers,
    )
    assert invalid_dataset_update_resp.status_code == 400


def test_sql_lab_routes_cover_sync_async_and_result_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(sql_lab_api, 'get_app_container', lambda: container)
    preview_handler = attach_handler(container, 'execute_sql_preview_handler', result={'columns': ['id'], 'data': [[1]]})
    submit_handler = attach_handler(container, 'submit_async_query_handler', result=SimpleNamespace(id=7, status=SQLQueryStatus.PENDING))
    status_handler = attach_handler(container, 'get_query_status_handler', result={'id': 7, 'status': SQLQueryStatus.RUNNING})
    result_handler = attach_handler(container, 'get_query_result_handler', result=FakeAsyncQuery(status=SQLQueryStatus.COMPLETED, result={'rows': [[1]]}))

    class FakeTaskQueue:
        def enqueue_sql_query(self, query_id):
            assert query_id == 7
            return 'job-7'

    monkeypatch.setattr('app.infrastructure.tasks.task_queue.TaskQueueManager', FakeTaskQueue)

    client = build_app(sql_lab_api.bp).test_client()
    headers = auth_headers()

    missing_payload_resp = client.post('/api/v1/sql_lab/execute', json={'sql_query': 'SELECT 1'}, headers=headers)
    assert missing_payload_resp.status_code == 400

    invalid_sql_resp = client.post(
        '/api/v1/sql_lab/execute',
        json={'source_id': 1, 'sql_query': 'DROP TABLE users'},
        headers=headers,
    )
    assert invalid_sql_resp.status_code == 400

    sync_resp = client.post(
        '/api/v1/sql_lab/execute',
        json={'source_id': 1, 'sql_query': 'SELECT 1', 'limit': 5000},
        headers=headers,
    )
    assert sync_resp.status_code == 200
    sync_command = preview_handler.handle.call_args.args[0]
    assert sync_command.limit == 1000

    async_resp = client.post(
        '/api/v1/sql_lab/execute',
        json={'source_id': 1, 'sql_query': 'SELECT 1', 'async': True},
        headers=headers,
    )
    assert async_resp.status_code == 202
    assert submit_handler.handle.call_args.kwargs['user_id'] == 'tester'
    container.submit_async_query_handler.return_value.update_job_id.assert_called_once()

    status_resp = client.get('/api/v1/sql_lab/query/7/status', headers=headers)
    assert status_resp.status_code == 200
    missing_status_resp = client.get('/api/v1/sql_lab/query/999/status', headers=headers)
    assert missing_status_resp.status_code == 200

    pending_query = FakeAsyncQuery(status=SQLQueryStatus.RUNNING)
    failed_query = FakeAsyncQuery(status=SQLQueryStatus.FAILED, error_message='boom')
    completed_query = FakeAsyncQuery(status=SQLQueryStatus.COMPLETED, result={'rows': [[1]]})
    result_handler.handle.side_effect = [None, pending_query, failed_query, completed_query]

    not_found_resp = client.get('/api/v1/sql_lab/query/404/result', headers=headers)
    assert not_found_resp.status_code == 404

    pending_resp = client.get('/api/v1/sql_lab/query/7/result', headers=headers)
    assert pending_resp.status_code == 202

    failed_resp = client.get('/api/v1/sql_lab/query/7/result', headers=headers)
    assert failed_resp.status_code == 400

    completed_resp = client.get('/api/v1/sql_lab/query/7/result', headers=headers)
    assert completed_resp.status_code == 200
    assert completed_resp.get_json()['data']['result'] == {'rows': [[1]]}

    validate_resp = client.post('/api/v1/sql_lab/validate', json={'sql_query': 'SELECT 1'}, headers=headers)
    assert validate_resp.status_code == 200
    assert validate_resp.get_json()['data']['valid'] is True


def test_sql_lab_async_queue_failure_marks_query_failed(monkeypatch):
    container = MagicMock()
    query = SimpleNamespace(id=8, status=SQLQueryStatus.PENDING)
    attach_handler(container, 'submit_async_query_handler', result=query)
    monkeypatch.setattr(sql_lab_api, 'get_app_container', lambda: container)

    class BrokenTaskQueue:
        def enqueue_sql_query(self, query_id):
            raise RuntimeError('queue down')

    monkeypatch.setattr('app.infrastructure.tasks.task_queue.TaskQueueManager', BrokenTaskQueue)
    client = build_app(sql_lab_api.bp).test_client()

    response = client.post(
        '/api/v1/sql_lab/execute',
        json={'source_id': 1, 'sql_query': 'SELECT 1', 'async': True},
        headers=auth_headers(),
    )

    assert response.status_code == 500
    container.submit_async_query_handler.return_value.mark_failed.assert_called_once()


def test_auth_routes_cover_login_sso_and_me(monkeypatch):
    monkeypatch.setattr(auth_api, 'generate_token', lambda **kwargs: f"token-for-{kwargs['user_id']}")
    monkeypatch.setattr(auth_api, '_ensure_internal_principal', lambda username, roles: username)

    class FakeAccessService:
        def upsert_feishu_principal(self, **kwargs):
            return SimpleNamespace(principal_id=kwargs['open_id'])

        def ensure_principal_role_bindings(self, **kwargs):
            return None

    monkeypatch.setattr(auth_api, '_access_service', lambda: FakeAccessService())
    client = build_app(auth_api.bp).test_client()

    missing_credentials_resp = client.post('/api/v1/auth/login', json={})
    assert missing_credentials_resp.status_code == 400

    misconfigured_app = build_app(auth_api.bp)
    misconfigured_app.config.update(ADMIN_USERNAME=None, ADMIN_PASSWORD=None)
    misconfigured_client = misconfigured_app.test_client()
    misconfigured_resp = misconfigured_client.post('/api/v1/auth/login', json={'username': 'admin', 'password': 'secret'})
    assert misconfigured_resp.status_code == 500

    app = build_app(auth_api.bp)
    app.config.update(
        ADMIN_USERNAME='admin',
        ADMIN_PASSWORD='secret',
        APP_BASE_URL='http://frontend.local',
        FEISHU_APP_ID='cli_123',
        FEISHU_ADMIN_OPEN_IDS='ou_admin',
    )
    client = app.test_client()

    invalid_login_resp = client.post('/api/v1/auth/login', json={'username': 'admin', 'password': 'wrong'})
    assert invalid_login_resp.status_code == 401

    login_resp = client.post('/api/v1/auth/login', json={'username': 'admin', 'password': 'secret'})
    assert login_resp.status_code == 200
    assert login_resp.get_json()['data']['token'] == 'token-for-admin'

    authorize_resp = client.get('/api/v1/auth/feishu/authorize')
    assert authorize_resp.status_code == 302
    assert 'app_id=cli_123' in authorize_resp.location

    missing_code_resp = client.get('/api/v1/auth/feishu/callback')
    assert missing_code_resp.status_code == 302
    assert 'error=' in missing_code_resp.location

    class FakeFeishuAuthClient:
        def get_user_access_token(self, code):
            assert code == 'auth-code'
            return {'access_token': 'feishu-token'}

        def get_user_info(self, token):
            assert token == 'feishu-token'
            return {'open_id': 'ou_admin', 'name': 'Feishu Admin'}

    monkeypatch.setattr('app.infrastructure.adapters.feishu.auth_client.FeishuAuthClient', FakeFeishuAuthClient)
    callback_resp = client.get('/api/v1/auth/feishu/callback?code=auth-code')
    assert callback_resp.status_code == 302
    assert 'token=token-for-ou_admin' in callback_resp.location

    class BrokenFeishuAuthClient:
        def get_user_access_token(self, code):
            raise RuntimeError('sso failed')

    monkeypatch.setattr('app.infrastructure.adapters.feishu.auth_client.FeishuAuthClient', BrokenFeishuAuthClient)
    failed_callback_resp = client.get('/api/v1/auth/feishu/callback?code=bad-code')
    assert failed_callback_resp.status_code == 302
    assert 'error=' in failed_callback_resp.location

    me_resp = client.get('/api/v1/auth/me', headers=auth_headers('admin'))
    assert me_resp.status_code == 200
    assert me_resp.get_json()['data']['user_id'] == 'admin'


def test_channel_and_subscription_routes_cover_crud_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(channels_api, 'get_container', lambda: container)
    monkeypatch.setattr(subscriptions_api, 'get_container', lambda: container)

    channel_service = MagicMock()
    subscription_service = MagicMock()
    channel_service.list_channels.return_value = {'items': [], 'total': 0}
    channel_service.create_channel.return_value = {'id': 1, 'name': '飞书'}
    channel_service.get_channel.return_value = {'id': 1}
    channel_service.update_channel.return_value = {'id': 1, 'name': '飞书-更新'}
    channel_service.enable_channel.return_value = {'id': 1, 'enabled': True}
    channel_service.disable_channel.return_value = {'id': 1, 'enabled': False}
    subscription_service.list_subscriptions.return_value = {'items': [], 'total': 0}
    subscription_service.create_subscription.return_value = {'id': 10}
    subscription_service.get_subscription.return_value = {'id': 10}
    subscription_service.update_subscription.return_value = {'id': 10, 'enabled': False}
    subscription_service.enable_subscription.return_value = {'id': 10, 'enabled': True}
    subscription_service.disable_subscription.return_value = {'id': 10, 'enabled': False}
    subscription_service.get_subscriptions_by_app_instance.return_value = [{'id': 10}]

    container.channel_service.return_value = channel_service
    container.subscription_service.return_value = subscription_service

    client = build_app(channels_api.bp, subscriptions_api.bp, subscriptions_api.app_instance_subscriptions_bp).test_client()
    headers = auth_headers()

    channels_list_resp = client.get('/api/v1/channels?channel_type=feishu&enabled=true&page=2&page_size=5', headers=headers)
    assert channels_list_resp.status_code == 200
    assert channel_service.list_channels.call_args.kwargs == {
        'channel_type': 'feishu',
        'enabled': True,
        'page': 2,
        'page_size': 5,
    }

    create_channel_resp = client.post(
        '/api/v1/channels',
        json={'name': '飞书', 'channel_type': 'feishu', 'config': {'webhook': 'x'}},
        headers=headers,
    )
    assert create_channel_resp.status_code == 201

    assert client.get('/api/v1/channels/1', headers=headers).status_code == 200
    assert client.put('/api/v1/channels/1', json={'name': '飞书-更新'}, headers=headers).status_code == 200
    assert client.delete('/api/v1/channels/1', headers=headers).status_code == 200
    assert client.post('/api/v1/channels/1/enable', headers=headers).status_code == 200
    assert client.post('/api/v1/channels/1/disable', headers=headers).status_code == 200

    subscriptions_list_resp = client.get('/api/v1/subscriptions?app_instance_id=2&channel_id=1&enabled=false&page=3&page_size=7', headers=headers)
    assert subscriptions_list_resp.status_code == 200
    assert subscription_service.list_subscriptions.call_args.kwargs == {
        'app_instance_id': 2,
        'channel_id': 1,
        'enabled': False,
        'page': 3,
        'page_size': 7,
    }

    create_subscription_resp = client.post(
        '/api/v1/subscriptions',
        json={'name': '日报', 'app_instance_id': 2, 'channel_id': 1, 'event_types': ['completed']},
        headers=headers,
    )
    assert create_subscription_resp.status_code == 201

    assert client.get('/api/v1/subscriptions/10', headers=headers).status_code == 200
    assert client.put('/api/v1/subscriptions/10', json={'enabled': False}, headers=headers).status_code == 200
    assert client.delete('/api/v1/subscriptions/10', headers=headers).status_code == 200
    assert client.post('/api/v1/subscriptions/10/enable', headers=headers).status_code == 200
    assert client.post('/api/v1/subscriptions/10/disable', headers=headers).status_code == 200
    assert client.get('/api/v1/app-instances/2/subscriptions', headers=headers).status_code == 200


def test_apps_and_app_instances_routes_cover_main_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(apps_api, 'get_container', lambda: container)
    monkeypatch.setattr(app_instances_api, 'get_container', lambda: container)
    monkeypatch.setattr(app_executions_api, 'get_container', lambda: container)

    app_definition_service = MagicMock()
    app_definition_service.get_all_apps.return_value = [{'code': 'report_push'}]
    app_definition_service.get_app_by_code.side_effect = [{'code': 'report_push'}, None]
    app_definition_service.get_config_schema.side_effect = [{'type': 'object'}, None]
    app_definition_service.get_categories.return_value = ['reporting']
    app_definition_service.validate_app_config.return_value = (True, [])

    instance_service = MagicMock()
    instance_service.list_instances.return_value = {'items': [], 'total': 0}
    instance_service.create_instance.return_value = {'id': 20}
    instance_service.get_instance.side_effect = [{'id': 20}, None]
    instance_service.update_instance.return_value = {'id': 20, 'name': '日报'}
    instance_service.enable_instance.return_value = {'id': 20, 'enabled': True}
    instance_service.disable_instance.return_value = {'id': 20, 'enabled': False}

    execution_service = MagicMock()
    execution_service.execute_instance.return_value = 300
    execution_service.list_executions.return_value = {'items': [], 'total': 0}
    execution_service.get_execution.side_effect = [{'id': 300}, None]
    execution_service.get_execution_stats.return_value = {'total': 3}

    container.app_definition_service.return_value = app_definition_service
    container.app_instance_service.return_value = instance_service
    container.execution_service.return_value = execution_service

    client = build_app(apps_api.bp, app_instances_api.bp, app_executions_api.bp).test_client()
    headers = auth_headers()

    apps_resp = client.get('/api/v1/apps?category=reporting&enabled_only=false&include_stats=true', headers=headers)
    assert apps_resp.status_code == 200
    assert app_definition_service.get_all_apps.call_args.kwargs == {
        'category': 'reporting',
        'enabled_only': False,
        'include_stats': True,
    }

    assert client.get('/api/v1/apps/report_push', headers=headers).status_code == 200
    assert client.get('/api/v1/apps/missing', headers=headers).status_code == 404
    assert client.get('/api/v1/apps/report_push/config-schema', headers=headers).status_code == 200
    assert client.get('/api/v1/apps/missing/config-schema', headers=headers).status_code == 404
    assert client.get('/api/v1/apps/categories', headers=headers).status_code == 200
    assert client.post('/api/v1/apps/report_push/validate', json={'config': {'foo': 'bar'}}, headers=headers).status_code == 200

    list_instances_resp = client.get('/api/v1/app-instances?app_code=report_push&owner=alice&enabled=true&page=2&page_size=9', headers=headers)
    assert list_instances_resp.status_code == 200
    assert instance_service.list_instances.call_args.kwargs == {
        'app_code': 'report_push',
        'owner': 'alice',
        'enabled': True,
        'page': 2,
        'page_size': 9,
    }

    create_instance_resp = client.post(
        '/api/v1/app-instances',
        json={'app_code': 'report_push', 'name': '日报', 'app_config': {'cron': '* * * * *'}, 'trigger_type': 'manual'},
        headers=headers,
    )
    assert create_instance_resp.status_code == 201

    assert client.get('/api/v1/app-instances/20', headers=headers).status_code == 200
    assert client.get('/api/v1/app-instances/404', headers=headers).status_code == 404
    assert client.put('/api/v1/app-instances/20', json={'name': '日报-更新'}, headers=headers).status_code == 200
    assert client.delete('/api/v1/app-instances/20', headers=headers).status_code == 200
    assert client.post('/api/v1/app-instances/20/enable', headers=headers).status_code == 200
    assert client.post('/api/v1/app-instances/20/disable', headers=headers).status_code == 200

    execute_resp = client.post('/api/v1/app-instances/20/execute', headers=headers)
    assert execute_resp.status_code == 200
    assert execute_resp.get_json()['data']['execution_id'] == 300

    executions_resp = client.get(
        '/api/v1/app-executions?app_code=report_push&instance_id=20&status=completed&trigger_type=manual&start_date=2026-01-01T00:00:00&end_date=2026-01-31T00:00:00&page=2&page_size=6',
        headers=headers,
    )
    assert executions_resp.status_code == 200
    execution_kwargs = execution_service.list_executions.call_args.kwargs
    assert execution_kwargs['app_code'] == 'report_push'
    assert execution_kwargs['instance_id'] == 20
    assert execution_kwargs['page_size'] == 6
    assert execution_kwargs['start_date'].isoformat() == '2026-01-01T00:00:00'

    assert client.get('/api/v1/app-executions/300', headers=headers).status_code == 200
    assert client.get('/api/v1/app-executions/999', headers=headers).status_code == 404
    assert client.get('/api/v1/app-executions/stats?instance_id=20&days=30', headers=headers).status_code == 200


def test_files_upload_route_covers_validation_and_success_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(
        files_api,
        'parse_tabular_file_metadata',
        lambda _path: {
            'row_count': 2,
            'statistics': {'dimensions': 2},
            'fields': [{'physical_name': 'id', 'display_name': 'id'}],
            'sample_rows': [{'id': 1, 'name': 'Alice'}],
        },
    )

    app = build_app(files_api.bp)
    app.config.update(ALLOWED_EXTENSIONS={'csv'}, UPLOAD_FOLDER=str(tmp_path))
    client = app.test_client()
    headers = auth_headers()

    missing_file_resp = client.post('/api/v1/files/upload', headers=headers)
    assert missing_file_resp.status_code == 400

    invalid_extension_resp = client.post(
        '/api/v1/files/upload',
        data={'file': (io.BytesIO(b'plain text'), 'notes.txt')},
        headers=headers,
        content_type='multipart/form-data',
    )
    assert invalid_extension_resp.status_code == 400

    upload_resp = client.post(
        '/api/v1/files/upload',
        data={'file': (io.BytesIO(b'id,name\n1,Alice\n2,Bob\n'), 'orders.csv')},
        headers=headers,
        content_type='multipart/form-data',
    )
    assert upload_resp.status_code == 200
    payload = upload_resp.get_json()['data']
    assert payload['file_name'] == 'orders.csv'
    assert payload['row_count'] == 2
    assert payload['statistics'] == {'dimensions': 2}
    assert payload['fields'][0]['display_name'] == 'id'
    assert payload['preview'] == [{'id': 1, 'name': 'Alice'}]


def test_extraction_routes_cover_task_preview_download_and_health_paths(tmp_path, monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(extraction_api, 'get_app_container', lambda: container)
    monkeypatch.setattr(
        'app.infrastructure.cache.decorators.query_cache',
        lambda *args, **kwargs: (lambda func: func),
    )

    fake_redis = SimpleNamespace(
        delete_pattern=MagicMock(),
        client=SimpleNamespace(ping=MagicMock(return_value=True)),
    )
    monkeypatch.setattr('app.infrastructure.cache.redis_client.get_redis_client', lambda: fake_redis)

    created_task = MagicMock()
    created_task.id = 101
    created_task.to_dict.return_value = {'id': 101, 'task_name': '每日提取'}
    updated_task = MagicMock()
    updated_task.id = 101
    updated_task.to_dict.return_value = {'id': 101, 'task_name': '每日提取-更新'}
    list_item = MagicMock()
    list_item.model_dump.return_value = {'id': 101, 'task_name': '每日提取'}
    run_item = MagicMock()
    run_item.to_dict.return_value = {'id': 201, 'status': 'success'}

    create_handler = attach_handler(container, 'create_task_handler', result=created_task)
    update_handler = attach_handler(container, 'update_task_handler', result=updated_task)
    delete_handler = attach_handler(container, 'delete_task_handler', result=True)
    execute_handler = attach_handler(container, 'execute_task_handler', result={'run_id': 201, 'job_id': 'job-201'})
    list_handler = attach_handler(
        container,
        'list_tasks_handler',
        result={'items': [list_item], 'total': 1, 'page': 1, 'page_size': 20, 'total_pages': 1},
    )
    preview_handler = attach_handler(container, 'preview_data_handler', result={'rows': [{'id': 1}], 'total': 1})
    repo = container.extraction_repository.return_value
    repo.list_runs.return_value = {'items': [run_item], 'total': 1}

    csv_path = tmp_path / 'result.csv'
    csv_path.write_text('id\n1\n', encoding='utf-8')
    download_run = MagicMock()
    download_run.status = 'success'
    download_run.delivery_method = 'file'
    download_run.result_file_path = str(csv_path)
    download_run.task = SimpleNamespace(task_name='daily_extract')
    download_run.can_download.side_effect = [False, True, True]

    class FakeConnection:
        def execute(self, _statement):
            return None

    class FakeEngine:
        def connect(self):
            return self

        def __enter__(self):
            return FakeConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeQueueManager:
        def get_queue_info(self):
            return {'pending': 0, 'failed': 0}

    monkeypatch.setattr('app.infrastructure.database.session.get_db_engine', lambda: FakeEngine())
    monkeypatch.setattr('app.infrastructure.tasks.task_queue.TaskQueueManager', FakeQueueManager)

    client = build_app(extraction_api.bp).test_client()
    headers = auth_headers()

    invalid_create_resp = client.post(
        '/api/v1/extraction/tasks',
        json={'task_name': '坏任务', 'dataset_id': 1, 'task_type': 'invalid'},
        headers=headers,
    )
    assert invalid_create_resp.status_code == 400

    create_resp = client.post(
        '/api/v1/extraction/tasks',
        json={'task_name': '每日提取', 'dataset_id': 1, 'select_fields': ['id'], 'filter_conditions': {}, 'task_type': 'manual'},
        headers=headers,
    )
    assert create_resp.status_code == 201
    assert create_handler.handle.call_args.args[0].created_by == 'tester'

    update_resp = client.put(
        '/api/v1/extraction/tasks/101',
        json={'task_name': '每日提取-更新', 'is_active': False},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_handler.handle.call_args.args[0].task_id == 101

    delete_resp = client.delete('/api/v1/extraction/tasks/101', headers=headers)
    assert delete_resp.status_code == 200
    assert delete_handler.handle.call_args.args[0].deleted_by == 'tester'

    execute_resp = client.post('/api/v1/extraction/tasks/101/execute', json={}, headers=headers)
    assert execute_resp.status_code == 200
    execute_command = execute_handler.handle.call_args.args[0]
    assert execute_command.task_id == 101
    assert execute_command.user_id == 'tester'

    list_resp = client.get(
        '/api/v1/extraction/tasks?dataset_id=1&task_type=manual&is_active=true&page=2&page_size=5',
        headers=headers,
    )
    assert list_resp.status_code == 200
    list_query = list_handler.handle.call_args.args[0]
    assert list_query.dataset_id == 1
    assert list_query.is_active is True
    assert list_query.page == 2

    runs_resp = client.get('/api/v1/extraction/runs?task_id=101&status=success&page=2&page_size=3', headers=headers)
    assert runs_resp.status_code == 200
    assert repo.list_runs.call_args.kwargs == {
        'task_id': 101,
        'status': 'success',
        'page': 2,
        'page_size': 3,
    }

    repo.find_run_by_id.return_value = None
    missing_download_resp = client.get('/api/v1/extraction/runs/999/download', headers=headers)
    assert missing_download_resp.status_code == 404

    repo.find_run_by_id.return_value = download_run
    blocked_download_resp = client.get('/api/v1/extraction/runs/201/download', headers=headers)
    assert blocked_download_resp.status_code == 400

    download_run.result_file_path = str(tmp_path / 'missing.csv')
    missing_file_resp = client.get('/api/v1/extraction/runs/201/download', headers=headers)
    assert missing_file_resp.status_code == 404

    download_run.result_file_path = str(csv_path)
    download_resp = client.get('/api/v1/extraction/runs/201/download', headers=headers)
    assert download_resp.status_code == 200
    assert 'daily_extract_201_' in download_resp.headers['Content-Disposition']

    preview_resp = client.post(
        '/api/v1/extraction/preview',
        json={'dataset_id': 1, 'select_fields': ['id'], 'filter_conditions': {}, 'limit': 5},
        headers=headers,
    )
    assert preview_resp.status_code == 200
    preview_query = preview_handler.handle.call_args.args[0]
    assert preview_query.dataset_id == 1
    assert preview_query.limit == 5

    health_resp = client.get('/api/v1/extraction/health')
    assert health_resp.status_code == 200
    assert health_resp.get_json()['data']['status'] == 'healthy'

    fake_redis.delete_pattern.assert_called()


def test_conversation_routes_cover_crud_and_message_paths(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(conversations_api, 'get_app_container', lambda: container)

    conversation = MagicMock()
    conversation.to_dict.return_value = {'id': 1, 'title': '问答'}
    create_handler = attach_handler(container, 'create_conversation_handler', result=conversation)
    list_handler = attach_handler(container, 'list_conversations_handler', result={'items': [{'id': 1}], 'total': 1})
    get_handler = attach_handler(container, 'get_conversation_handler', result={'id': 1, 'title': '问答', 'messages': []})
    send_handler = attach_handler(
        container,
        'send_message_handler',
        result={'user_message': {'id': 1}, 'ai_message': {'id': 2}},
    )
    repo = container.conversation_repository.return_value

    client = build_app(conversations_api.bp).test_client()

    create_resp = client.post(
        '/api/v1/conversations',
        json={'dataset_id': 9, 'title': '问答', 'description': '测试'},
    )
    assert create_resp.status_code == 201
    assert create_handler.handle.call_args.args[0].user_id == 'anonymous'

    list_resp = client.get('/api/v1/conversations?offset=5&limit=10')
    assert list_resp.status_code == 200
    list_query = list_handler.handle.call_args.args[0]
    assert list_query.offset == 5
    assert list_query.limit == 10

    get_resp = client.get('/api/v1/conversations/1')
    assert get_resp.status_code == 200
    assert get_handler.handle.call_args.args[0].conversation_id == 1

    delete_resp = client.delete('/api/v1/conversations/1')
    assert delete_resp.status_code == 200
    repo.delete.assert_called_once_with(1)

    send_resp = client.post('/api/v1/conversations/1/messages', json={'content': '你好'})
    assert send_resp.status_code == 200
    assert send_handler.handle.call_args.args[0].content == '你好'


def test_semantic_routes_cover_file_management_schema_sync_and_error_paths(tmp_path, monkeypatch):
    semantic_service = MagicMock()
    semantic_service.list_cubes.return_value = [
        {'name': 'orders', 'title': '订单', 'description': '订单事实表', 'domain_name': '学业域', 'state_summary': {'sync_status': 'ok'}}
    ]
    semantic_service.list_views.return_value = []
    semantic_service.describe_view.return_value = {'error': 'not found'}
    semantic_service._cube_repo.list_all.return_value = []
    semantic_service._view_repo = MagicMock()
    semantic_service._recipe_repo.list_all.return_value = []
    semantic_service._definition_service = MagicMock()
    semantic_service.invalidate_cache = MagicMock()
    semantic_service.validate_cube.return_value = [{'level': 'ok', 'message': 'cube ok'}]
    semantic_service.validate_view.return_value = [{'level': 'ok', 'message': 'view ok'}]
    semantic_service.query.return_value = {'error': 'query failed', 'retryable': False}
    semantic_service.compile_query.side_effect = RuntimeError('dsl broken')

    publish_service = MagicMock()
    publish_service.publish_view.side_effect = Exception('未找到 View')

    modeling_service = MagicMock()
    modeling_service.update_cube.side_effect = Exception('未找到 Cube')
    modeling_service.deprecate_cube.side_effect = Exception('弃用失败')

    domain_modeling_service = MagicMock()
    domain_modeling_service.DEFAULT_CATALOG_CODE = 'default'
    domain_modeling_service.list_domains.return_value = []
    domain_modeling_service.list_catalogs.return_value = []
    domain_modeling_service.update_catalog.side_effect = Exception('未找到目录')
    domain_modeling_service.validate_domain.return_value = [{'level': 'ok', 'message': 'domain ok'}]
    domain_modeling_service._domain_repo.reload = MagicMock()

    domain_canvas_service = MagicMock()
    registry_repo = MagicMock()

    monkeypatch.setattr('app.interfaces.api.v1.semantic._semantic_base', lambda: str(tmp_path))

    cubes_dir = tmp_path / 'cubes'
    views_dir = tmp_path / 'views'
    recipes_dir = tmp_path / 'recipes'
    domains_dir = tmp_path / 'domains'
    for directory in (cubes_dir, views_dir, recipes_dir, domains_dir):
        directory.mkdir(parents=True, exist_ok=True)

    (cubes_dir / 'orders.yml').write_text(
        '\n'.join([
            'name: orders',
            'title: 订单',
            'table: ods.orders',
            'dimensions:',
            '  id:',
            '    title: ID',
            '    type: string',
            '    sql: "{CUBE}.id"',
            'measures:',
            '  total_count:',
            '    title: 总数',
            '    type: count',
            '    sql: "{CUBE}.id"',
        ]),
        encoding='utf-8',
    )
    (domains_dir / 'domain_learning.yml').write_text(
        '\n'.join([
            'code: learning',
            'name: 学习域',
            'cubes:',
            '  - orders',
        ]),
        encoding='utf-8',
    )

    report = MagicMock()
    report.has_drifts = True
    report.to_dict.return_value = {
        'total_cubes': 1,
        'checked_cubes': 1,
        'skipped_cubes': 0,
        'drifts': [{'cube_name': 'orders'}],
    }
    sync_service = MagicMock()
    sync_service.check_all.return_value = report
    sync_service.check_cube.return_value = report
    notifier = MagicMock()

    monkeypatch.setattr('app.application.semantic.schema_sync_service.SchemaSyncService', lambda **kwargs: sync_service)
    monkeypatch.setattr('app.infrastructure.notification.feishu_webhook.FeishuWebhookNotifier', lambda webhook_url: notifier)

    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(
        create_semantic_blueprint(
            semantic_service=semantic_service,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=publish_service,
            registry_repo=registry_repo,
            modeling_service=modeling_service,
            domain_modeling_service=domain_modeling_service,
            domain_canvas_service=domain_canvas_service,
            query_adapter_getter=lambda: (MagicMock(), 'mock_project'),
        )
    )
    register_error_handlers(app)
    client = _install_admin_auth(app.test_client())

    assert client.put('/api/v1/semantic/cubes/orders', json={'title': '订单'}).status_code == 404
    assert client.post('/api/v1/semantic/cubes/orders/deprecate').status_code == 400
    assert client.put('/api/v1/semantic/catalogs/learning', json={'name': '学习分析'}).status_code == 404
    assert client.post('/api/v1/semantic/domains/learning/cubes', json={}).status_code == 400
    assert client.post('/api/v1/semantic/views/v_missing/materialize', json={}).status_code == 404
    assert client.post('/api/v1/semantic/compile', json={}).status_code == 400
    assert client.post('/api/v1/semantic/query', json={'dsl': {'measures': ['orders.total_count']}}).status_code == 400

    files_resp = client.get('/api/v1/semantic/files')
    assert files_resp.status_code == 200
    assert files_resp.get_json()['data']['cubes'] == ['orders']
    assert files_resp.get_json()['data']['domains'] == ['learning']

    invalid_type_resp = client.get('/api/v1/semantic/files/unknown/orders')
    assert invalid_type_resp.status_code == 400

    read_resp = client.get('/api/v1/semantic/files/cubes/orders')
    assert read_resp.status_code == 200
    assert 'name: orders' in read_resp.get_json()['data']['content']

    missing_write_resp = client.put('/api/v1/semantic/files/cubes/orders', json={})
    assert missing_write_resp.status_code == 400

    invalid_yaml_resp = client.put(
        '/api/v1/semantic/files/cubes/orders',
        json={'content': 'name: [invalid'},
    )
    assert invalid_yaml_resp.status_code == 400

    write_resp = client.put(
        '/api/v1/semantic/files/domains/learning',
        json={'content': 'code: learning\nname: 学习域\ncubes:\n  - orders\n'},
    )
    assert write_resp.status_code == 200
    semantic_service.invalidate_cache.assert_called()
    domain_modeling_service._domain_repo.reload.assert_called()

    validate_resp = client.post(
        '/api/v1/semantic/files/cubes/orders/validate',
        json={'content': 'name: orders\ntitle: 订单\ntable: ods.orders\ndimensions:\n  id:\n    title: ID\n    type: string\n    sql: "{CUBE}.id"\nmeasures:\n  total_count:\n    title: 总数\n    type: count\n    sql: "{CUBE}.id"\n'},
    )
    assert validate_resp.status_code == 200
    assert validate_resp.get_json()['data']['valid'] is True

    invalid_validate_resp = client.post(
        '/api/v1/semantic/files/cubes/orders/validate',
        json={'content': 'name: [invalid'},
    )
    assert invalid_validate_resp.status_code == 200
    assert invalid_validate_resp.get_json()['data']['valid'] is False

    sync_resp = client.post(
        '/api/v1/semantic/schema-sync',
        json={'cube_name': 'orders', 'notify': True, 'webhook_url': 'https://example.com/hook'},
    )
    assert sync_resp.status_code == 200
    assert sync_resp.get_json()['data']['notified'] is True
    sync_service.check_cube.assert_called_once_with('orders')
    notifier.send_schema_drift_report.assert_called_once()


def test_semantic_helpers_and_default_wiring_cover_pagination_views_graph_and_query(monkeypatch, tmp_path):
    assert semantic_api._json_scalar('ok') == 'ok'
    assert semantic_api._json_scalar(object()) is None
    assert semantic_api._extract_view_cube_name(' orders ') == 'orders'
    assert semantic_api._extract_view_cube_name(SimpleNamespace(join_path='students.profile>classes')) == 'students'
    assert semantic_api._extract_view_cube_name(SimpleNamespace(join_path='   ')) is None
    assert semantic_api._semantic_base().endswith('infrastructure/semantic')

    from app.executors.schema_drift_executor import SchemaDriftExecutor
    monkeypatch.setattr(SchemaDriftExecutor, '_get_maxcompute_adapter', staticmethod(lambda: ('adapter', 'project')))
    assert semantic_api._default_query_adapter_getter() == ('adapter', 'project')

    captured: dict[str, object] = {}

    class FakeViewPublishService:
        def __init__(self, **kwargs):
            captured['publish_service'] = kwargs

        def publish_view(self, view_name, source_id=None):
            return {'action': 'updated', 'view_name': view_name, 'source_id': source_id}

        def get_publish_status(self, view_name):
            return {'view_name': view_name, 'status': 'published'}

        def get_batch_publish_status(self, public_only=True):
            return {'views': [], 'public_only': public_only}

    class FakeDatasourceRepository:
        def __init__(self, session):
            captured['datasource_session'] = session

    class FakeRuntimeBindingService:
        def __init__(self, datasource_repository):
            captured['runtime_binding'] = datasource_repository

    class FakeCubeModelingService:
        def __init__(self, **kwargs):
            captured['modeling_service'] = kwargs

    class FakeYamlDomainRepository:
        def __init__(self, path):
            captured['domain_repo_path'] = path

    class FakeYamlCatalogRepository:
        def __init__(self, path):
            captured['catalog_repo_path'] = path

    class FakeDomainModelingService:
        DEFAULT_CATALOG_CODE = 'default'

        def __init__(self, **kwargs):
            captured['domain_modeling_service'] = kwargs

        def list_domains(self):
            return [{'code': 'learning', 'name': '学习域', 'catalog_code': None, 'description': '学习分析'}]

    class FakeDomainCanvasService:
        def __init__(self, **kwargs):
            captured['domain_canvas_service'] = kwargs

    import app.application.semantic.cube_modeling_service as modeling_mod
    import app.application.semantic.domain_canvas_service as canvas_mod
    import app.application.semantic.domain_modeling_service as domain_mod
    import app.application.semantic.semantic_runtime_binding_service as runtime_mod
    import app.application.semantic.view_publish_service as publish_mod
    import app.extensions as extensions_mod
    import app.infrastructure.repositories.datasource_repository as datasource_repo_mod
    import app.infrastructure.semantic.yaml_catalog_repository as yaml_catalog_mod
    import app.infrastructure.semantic.yaml_domain_repository as yaml_domain_mod

    monkeypatch.setattr(modeling_mod, 'CubeModelingService', FakeCubeModelingService)
    monkeypatch.setattr(canvas_mod, 'DomainCanvasService', FakeDomainCanvasService)
    monkeypatch.setattr(domain_mod, 'DomainModelingService', FakeDomainModelingService)
    monkeypatch.setattr(runtime_mod, 'SemanticRuntimeBindingService', FakeRuntimeBindingService)
    monkeypatch.setattr(publish_mod, 'ViewPublishService', FakeViewPublishService)
    monkeypatch.setattr(datasource_repo_mod, 'DatasourceRepository', FakeDatasourceRepository)
    monkeypatch.setattr(yaml_catalog_mod, 'YamlCatalogRepository', FakeYamlCatalogRepository)
    monkeypatch.setattr(yaml_domain_mod, 'YamlDomainRepository', FakeYamlDomainRepository)
    monkeypatch.setattr(extensions_mod, 'db', SimpleNamespace(session='db-session'))
    monkeypatch.setattr(semantic_api, '_semantic_base', lambda: str(tmp_path))

    semantic_service = MagicMock()
    semantic_service._definition_service = SimpleNamespace(_runtime_binding_service=None)
    semantic_service._query_service = MagicMock()
    semantic_service._cube_repo = MagicMock()
    semantic_service._view_repo = MagicMock()
    semantic_service._recipe_repo.list_all.return_value = []
    semantic_service.invalidate_cache = MagicMock()
    semantic_service.query.return_value = {'rows': [], 'total': 0}
    semantic_service.list_cubes.return_value = [
        {'name': 'orders', 'title': '订单', 'description': '订单事实', 'domain_name': '学习域', 'state_summary': ['invalid']},
        {'name': 'students', 'title': '学生', 'description': '学生维表', 'domain_name': '学习域', 'state_summary': {'source_binding_summary': 'mock'}},
    ]
    semantic_service.list_views.return_value = [
        SimpleNamespace(
            name='private_view',
            title='私有视图',
            description=None,
            public=False,
            cubes=['orders', SimpleNamespace(join_path='students.profile>classes'), SimpleNamespace(join_path='  ')],
        )
    ]
    semantic_service._cube_repo.list_all.return_value = [
        SimpleNamespace(
            name='orders',
            title='订单',
            dimensions={'id': object()},
            measures={'cnt': 1, 'amt': 2, 'avg': 3},
            joins={'students': SimpleNamespace(cube='students', type='left', sql='{CUBE}.student_id = {students}.id')},
            status=object(),
            source_id=object(),
            source_database='dwh',
            source_schema=None,
        )
    ]

    bp = semantic_api.create_semantic_blueprint(
        semantic_service=semantic_service,
        dataset_repo=MagicMock(),
        dataset_handler=MagicMock(),
        registry_repo=MagicMock(),
    )
    assert bp.name == 'semantic'
    assert captured['publish_service']['definition_service'] is semantic_service._definition_service
    assert captured['datasource_session'] == 'db-session'
    assert captured['modeling_service']['cube_repo'] is semantic_service._cube_repo
    assert str(captured['domain_repo_path']).endswith('/domains')
    assert str(captured['catalog_repo_path']).endswith('/catalogs')

    client = _install_admin_auth(build_app(bp).test_client())

    cubes_resp = client.get('/api/v1/semantic/cubes?page=abc&page_size=0&q=订单')
    assert cubes_resp.status_code == 200
    cubes_payload = cubes_resp.get_json()['data']
    assert cubes_payload['page'] == 1
    assert cubes_payload['page_size'] == 20
    assert [item['name'] for item in cubes_payload['cubes']] == ['orders']

    paged_resp = client.get('/api/v1/semantic/cubes?page=2&page_size=1&q=   ')
    assert paged_resp.status_code == 200
    assert paged_resp.get_json()['data']['page'] == 2
    assert [item['name'] for item in paged_resp.get_json()['data']['cubes']] == ['orders']

    domains_resp = client.get('/api/v1/semantic/domains?page=&page_size=999&catalog_code=default&q=学习')
    assert domains_resp.status_code == 200
    domains_payload = domains_resp.get_json()['data']
    assert domains_payload['page'] == 1
    assert domains_payload['page_size'] == 200
    assert domains_payload['domains'][0]['code'] == 'learning'

    views_resp = client.get('/api/v1/semantic/views?include_private=true&q=私有')
    assert views_resp.status_code == 200
    assert semantic_service.list_views.call_args.kwargs == {'public_only': False}
    assert views_resp.get_json()['data']['views'][0]['cubes'] == ['orders', 'students']

    query_resp = client.post('/api/v1/semantic/query', json={'dsl': {'measures': ['orders.total_count']}})
    assert query_resp.status_code == 200
    semantic_service.query.assert_called_with({'measures': ['orders.total_count']}, adapter=None)

    graph_resp = client.get('/api/v1/semantic/graph')
    assert graph_resp.status_code == 200
    graph_payload = graph_resp.get_json()['data']
    assert graph_payload['nodes'][0]['status'] is None
    assert graph_payload['nodes'][0]['source_id'] is None
    assert graph_payload['nodes'][0]['source_database'] == 'dwh'
    assert graph_payload['edges'][0]['source'] == 'orders'

    view = client.application.view_functions['semantic.list_cubes']
    inner = next(
        (
            cell.cell_contents for cell in (view.__closure__ or ())
            if callable(cell.cell_contents) and getattr(cell.cell_contents, '__name__', '') == 'list_cubes'
        ),
        view,
    )
    contains_keyword = next(
        cell.cell_contents
        for cell in inner.__closure__
        if callable(cell.cell_contents) and getattr(cell.cell_contents, '__name__', '') == '_contains_keyword'
    )
    assert contains_keyword({'name': 'orders'}, '   ', ['name']) is True


def test_semantic_routes_cover_error_and_validation_variants(monkeypatch, tmp_path):
    semantic_service = MagicMock()
    semantic_service.list_cubes.return_value = []
    semantic_service.list_views.return_value = []
    semantic_service.describe_view.return_value = {'name': 'v1'}
    semantic_service._cube_repo.list_all.return_value = []
    semantic_service._view_repo = MagicMock()
    semantic_service._recipe_repo.list_all.return_value = []
    semantic_service._definition_service = MagicMock()
    semantic_service.invalidate_cache = MagicMock()
    semantic_service.query.return_value = {'rows': []}
    semantic_service.validate_view.return_value = [{'level': 'ok', 'message': 'view ok'}]

    publish_service = MagicMock()
    publish_service.publish_view.side_effect = RuntimeError('publish exploded')
    publish_service.get_publish_status.return_value = {'status': 'idle'}
    publish_service.get_batch_publish_status.return_value = {'views': []}

    modeling_service = MagicMock()
    modeling_service.generate_cube_draft.side_effect = RuntimeError('draft exploded')
    modeling_service.create_cube.side_effect = RuntimeError('create exploded')
    modeling_service.activate_cube.side_effect = RuntimeError('activate exploded')
    modeling_service.deprecate_cube.side_effect = Exception('未找到 Cube')
    modeling_source_service = MagicMock()
    modeling_source_service.generate_cube_draft_from_source.side_effect = RuntimeError('draft exploded')

    domain_modeling_service = MagicMock()
    domain_modeling_service.DEFAULT_CATALOG_CODE = 'default'
    domain_modeling_service.list_domains.return_value = []
    domain_modeling_service.list_catalogs.return_value = []
    domain_modeling_service.create_catalog.side_effect = RuntimeError('catalog create exploded')
    domain_modeling_service.update_catalog.side_effect = RuntimeError('catalog update exploded')
    domain_modeling_service.delete_catalog.side_effect = RuntimeError('catalog delete exploded')
    domain_modeling_service.create_domain.side_effect = RuntimeError('domain create exploded')
    domain_modeling_service.get_domain_detail.side_effect = Exception('missing domain')
    domain_modeling_service.update_domain.side_effect = RuntimeError('domain update exploded')
    domain_modeling_service.add_cube.side_effect = RuntimeError('add cube exploded')
    domain_modeling_service.publish_domain.side_effect = RuntimeError('publish domain exploded')
    domain_modeling_service.validate_domain.return_value = [{'level': 'ok', 'message': 'domain ok'}]

    domain_canvas_service = MagicMock()
    domain_canvas_service.get_canvas.side_effect = Exception('missing canvas')

    monkeypatch.setattr(semantic_api.logger, 'error', MagicMock())
    monkeypatch.setattr(semantic_api, '_semantic_base', lambda: str(tmp_path))

    views_dir = tmp_path / 'views'
    views_dir.mkdir(parents=True, exist_ok=True)
    (views_dir / 'private_view.yaml').write_text(
        'name: private_view\ntitle: 私有视图\ncubes:\n  - join_path: orders\n    includes: "*"\n',
        encoding='utf-8',
    )

    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(
        create_semantic_blueprint(
            semantic_service=semantic_service,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=publish_service,
            registry_repo=MagicMock(),
            modeling_service=modeling_service,
            modeling_source_service=modeling_source_service,
            domain_modeling_service=domain_modeling_service,
            domain_canvas_service=domain_canvas_service,
        )
    )
    register_error_handlers(app)
    client = _install_admin_auth(app.test_client())

    assert client.post('/api/v1/semantic/cubes/draft-from-source', json={}).status_code == 400
    assert client.post(
        '/api/v1/semantic/cubes/draft-from-source',
        json={'source_kind': 'physical_table', 'source_id': 1, 'database': 'ods', 'table': 'orders'},
    ).status_code == 400
    assert client.post('/api/v1/semantic/cubes', json={'name': 'orders'}).status_code == 400
    assert client.post('/api/v1/semantic/cubes/orders/activate').status_code == 400
    assert client.post('/api/v1/semantic/cubes/orders/deprecate').status_code == 404

    assert client.post('/api/v1/semantic/catalogs', json={'name': '学习分析'}).status_code == 400
    assert client.put('/api/v1/semantic/catalogs/learning', json={'name': '学习分析'}).status_code == 400
    assert client.delete('/api/v1/semantic/catalogs/learning').status_code == 400

    assert client.post('/api/v1/semantic/domains', json={'name': '学习域'}).status_code == 400
    assert client.get('/api/v1/semantic/domains/learning').status_code == 404
    assert client.put('/api/v1/semantic/domains/learning', json={'name': '学习域'}).status_code == 400
    assert client.get('/api/v1/semantic/domains/learning/canvas').status_code == 404
    assert client.post('/api/v1/semantic/domains/learning/cubes', json={'cube_name': 'orders'}).status_code == 400
    assert client.post('/api/v1/semantic/domains/learning/publish', json={'cubes': ['orders']}).status_code == 400

    assert client.post('/api/v1/semantic/views/private_view/materialize', json={'source_id': 1}).status_code == 400
    assert client.post('/api/v1/semantic/query', json={}).status_code == 400

    alt_read_resp = client.get('/api/v1/semantic/files/views/private_view')
    assert alt_read_resp.status_code == 200
    assert 'private_view' in alt_read_resp.get_json()['data']['content']

    missing_read_resp = client.get('/api/v1/semantic/files/domains/missing')
    assert missing_read_resp.status_code == 404

    invalid_type_write = client.put('/api/v1/semantic/files/unknown/private_view', json={'content': 'x'})
    assert invalid_type_write.status_code == 400

    missing_validate = client.post('/api/v1/semantic/files/views/private_view/validate', json={})
    assert missing_validate.status_code == 400

    validate_view = client.post(
        '/api/v1/semantic/files/views/private_view/validate',
        json={'content': 'name: private_view\ntitle: 私有视图\ncubes:\n  - join_path: orders\n    includes: "*"\n'},
    )
    assert validate_view.status_code == 200
    assert validate_view.get_json()['data']['valid'] is True

    validate_domain = client.post(
        '/api/v1/semantic/files/domains/learning/validate',
        json={'content': 'code: learning\nname: 学习域\ncubes:\n  - orders\n'},
    )
    assert validate_domain.status_code == 200
    assert validate_domain.get_json()['data']['valid'] is True


def test_semantic_schema_sync_without_adapter_uses_null_inspector(monkeypatch):
    semantic_service = MagicMock()
    semantic_service._definition_service = SimpleNamespace(_runtime_binding_service=None)
    semantic_service._cube_repo = MagicMock()
    semantic_service._view_repo = MagicMock()
    semantic_service._recipe_repo.list_all.return_value = []
    semantic_service.list_cubes.return_value = []

    report = MagicMock()
    report.has_drifts = False
    report.to_dict.return_value = {
        'total_cubes': 0,
        'checked_cubes': 0,
        'skipped_cubes': 0,
        'drifts': [],
    }

    captured: dict[str, object] = {}

    class FakeSchemaSyncService:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def check_all(self):
            return report

    monkeypatch.setattr('app.application.semantic.schema_sync_service.SchemaSyncService', FakeSchemaSyncService)

    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(
        create_semantic_blueprint(
            semantic_service=semantic_service,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=MagicMock(),
            registry_repo=MagicMock(),
            modeling_service=MagicMock(),
            domain_modeling_service=MagicMock(DEFAULT_CATALOG_CODE='default'),
            domain_canvas_service=MagicMock(),
        )
    )
    register_error_handlers(app)
    client = _install_admin_auth(app.test_client())

    resp = client.post('/api/v1/semantic/schema-sync', json={})
    assert resp.status_code == 200
    assert captured['inspector'].get_table_columns('orders') == []
    assert captured['inspector'].fetch_dict_enums('dict') is None


def test_semantic_routes_cover_remaining_success_and_not_found_branches():
    semantic_service = MagicMock()
    semantic_service.list_cubes.return_value = []
    semantic_service.list_views.return_value = []
    semantic_service._cube_repo.list_all.return_value = []
    semantic_service._view_repo = MagicMock()
    semantic_service._recipe_repo.list_all.return_value = []
    semantic_service._definition_service = MagicMock()

    def _cube_payload(name):
        return SimpleNamespace(model_dump=lambda mode='json': {'name': name, 'status': 'active'})

    modeling_service = MagicMock()
    modeling_service.update_cube.side_effect = [RuntimeError('update exploded'), _cube_payload('orders')]
    modeling_service.activate_cube.side_effect = Exception('未找到 Cube')
    modeling_service.deprecate_cube.return_value = _cube_payload('orders')

    domain_modeling_service = MagicMock()
    domain_modeling_service.DEFAULT_CATALOG_CODE = 'default'
    domain_modeling_service.list_domains.return_value = []
    domain_modeling_service.list_catalogs.return_value = []
    domain_modeling_service.delete_catalog.side_effect = Exception('未找到目录')
    domain_modeling_service.get_domain_detail.return_value = {'code': 'learning', 'name': '学习域'}
    domain_modeling_service.update_domain.return_value = SimpleNamespace(id='learning', code='learning')
    domain_modeling_service.add_cube.return_value = SimpleNamespace(id='learning', code='learning')

    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(
        create_semantic_blueprint(
            semantic_service=semantic_service,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=MagicMock(),
            registry_repo=MagicMock(),
            modeling_service=modeling_service,
            domain_modeling_service=domain_modeling_service,
            domain_canvas_service=MagicMock(),
        )
    )
    register_error_handlers(app)
    client = _install_admin_auth(app.test_client())

    assert client.put('/api/v1/semantic/cubes/orders', json={'title': '订单'}).status_code == 400
    update_success_resp = client.put('/api/v1/semantic/cubes/orders', json={'title': '订单 v2'})
    assert update_success_resp.status_code == 200
    assert update_success_resp.get_json()['data']['name'] == 'orders'
    assert client.post('/api/v1/semantic/cubes/orders/activate').status_code == 404

    deprecate_resp = client.post('/api/v1/semantic/cubes/orders/deprecate')
    assert deprecate_resp.status_code == 200
    assert deprecate_resp.get_json()['data']['name'] == 'orders'

    assert client.delete('/api/v1/semantic/catalogs/learning').status_code == 404

    describe_resp = client.get('/api/v1/semantic/domains/learning')
    assert describe_resp.status_code == 200
    assert describe_resp.get_json()['data']['code'] == 'learning'

    update_resp = client.put('/api/v1/semantic/domains/learning', json={'name': '学习域'})
    assert update_resp.status_code == 200

    add_cube_resp = client.post('/api/v1/semantic/domains/learning/cubes', json={'cube_name': 'orders'})
    assert add_cube_resp.status_code == 200


def test_feishu_routes_cover_events_p2p_admin_and_card_actions(monkeypatch):
    container = MagicMock()
    monkeypatch.setattr(feishu_api, 'get_container', lambda: container)

    class ImmediateThread:
        def __init__(self, target=None, args=(), kwargs=None):
            self.target = target
            self.args = args
            self.kwargs = kwargs or {}
            self.daemon = False

        def start(self):
            if self.target:
                self.target(*self.args, **self.kwargs)

    monkeypatch.setattr(feishu_api.threading, 'Thread', ImmediateThread)

    list_handler = MagicMock()
    list_handler.handle.side_effect = [
        [{'chat_id': 'oc_1', 'active': True}],
        [{'chat_id': 'oc_1', 'active': True}, {'chat_id': 'oc_2', 'active': False}],
    ]
    update_handler = MagicMock()
    update_handler.handle.side_effect = [None, {'chat_id': 'oc_1', 'active': False}]
    chat_repo = container.feishu_chat_repository.return_value
    container.list_chats_handler.return_value = list_handler
    container.update_chat_handler.return_value = update_handler
    container.redis_client.return_value = MagicMock()

    rate_limit_stub = lambda *args, **kwargs: (True, {'current': 1, 'retry_after': 0})
    monkeypatch.setattr('app.shared.utils.rate_limiter.check_rate_limit', rate_limit_stub)

    memory = MagicMock()
    monkeypatch.setattr('app.application.agent.services.conversation_memory.ConversationMemory', lambda redis: memory)

    feishu_client = MagicMock()
    monkeypatch.setattr('app.infrastructure.adapters.feishu.client.FeishuClient', lambda: feishu_client)

    log_entry = MagicMock()
    log_entry.id = 11
    db_session = MagicMock()
    db_session.query.return_value.filter_by.return_value.first.return_value = log_entry
    monkeypatch.setattr('app.extensions.db', SimpleNamespace(session=db_session))

    app = build_app(feishu_api.bp)
    app.config.update(FEISHU_VERIFICATION_TOKEN='expected-token')
    client = app.test_client()
    headers = auth_headers()

    challenge_resp = client.post('/api/v1/feishu/events', json={'challenge': 'challenge-token'})
    assert challenge_resp.status_code == 200
    assert challenge_resp.get_json() == {'challenge': 'challenge-token'}

    parse_error_resp = client.post('/api/v1/feishu/events', data='{', content_type='text/plain')
    assert parse_error_resp.status_code == 200
    assert parse_error_resp.get_json()['message'] == 'parse_error'

    invalid_token_resp = client.post('/api/v1/feishu/events', json={'token': 'bad-token'})
    assert invalid_token_resp.status_code == 401

    added_resp = client.post(
        '/api/v1/feishu/events',
        json={
            'token': 'expected-token',
            'header': {'event_type': 'im.message.receive_v1'},
            'event': {'message': {'chat_id': 'oc_1', 'chat_name': '日报群', 'chat_type': 'group'}},
        },
    )
    assert added_resp.status_code == 200
    chat_repo.upsert.assert_called_with('oc_1', '日报群', added_via='event')

    deleted_resp = client.post(
        '/api/v1/feishu/events',
        json={
            'token': 'expected-token',
            'header': {'event_type': 'im.chat.member.bot.deleted_v1'},
            'event': {'chat_id': 'oc_1'},
        },
    )
    assert deleted_resp.status_code == 200
    chat_repo.deactivate.assert_called_with('oc_1')

    monkeypatch.setattr(
        'app.application.agent.agent_factory.get_data_agent_config',
        lambda: {'allowed_user_ids': []},
    )
    reset_resp = client.post(
        '/api/v1/feishu/events',
        json={
            'token': 'expected-token',
            'header': {'event_type': 'im.message.receive_v1'},
            'event': {
                'sender': {'sender_id': {'open_id': 'ou_1'}},
                'message': {
                    'chat_id': 'oc_p2p',
                    'chat_type': 'p2p',
                    'content': '{"text":"/reset"}',
                },
            },
        },
    )
    assert reset_resp.status_code == 200
    memory.clear.assert_called_with('oc_p2p')
    feishu_client.send_text_message.assert_called_with('oc_p2p', '对话已重置，可以开始新的查询。')

    chats_resp = client.get('/api/v1/feishu/chats', headers=headers)
    assert chats_resp.status_code == 200
    assert list_handler.handle.call_args_list[0].kwargs == {'active_only': True}

    chats_all_resp = client.get('/api/v1/feishu/chats/all', headers=headers)
    assert chats_all_resp.status_code == 200
    assert list_handler.handle.call_args_list[1].kwargs == {'active_only': False}

    missing_active_resp = client.patch('/api/v1/feishu/chats/oc_1', json={}, headers=headers)
    assert missing_active_resp.status_code == 400

    not_found_resp = client.patch('/api/v1/feishu/chats/oc_1', json={'active': False}, headers=headers)
    assert not_found_resp.status_code == 404

    update_resp = client.patch('/api/v1/feishu/chats/oc_1', json={'active': False}, headers=headers)
    assert update_resp.status_code == 200
    assert update_handler.handle.call_args_list[-1].args[0] == 'oc_1'

    invalid_card_resp = client.post('/api/v1/feishu/card_action', json={'action': {'value': {}}})
    assert invalid_card_resp.status_code == 200
    assert invalid_card_resp.get_json()['toast']['type'] == 'info'

    positive_card_resp = client.post(
        '/api/v1/feishu/card_action',
        json={'action': {'value': {'feedback': 'positive', 'query_id': '11'}}},
    )
    assert positive_card_resp.status_code == 200
    log_entry.set_feedback.assert_called_with('positive')
    db_session.commit.assert_called()


def _prepare_feishu_agent_runtime(monkeypatch, *, agent_service):
    container = MagicMock()
    container.redis_client.return_value = MagicMock()
    container.agent_loop_service.return_value = MagicMock()
    container.prompt_builder.return_value = MagicMock()
    container.tool_registry.return_value = MagicMock()
    monkeypatch.setattr(feishu_api, 'get_container', lambda: container)

    session = MagicMock()
    monkeypatch.setattr('app.extensions.db', SimpleNamespace(session=session))

    feishu_client = MagicMock()
    monkeypatch.setattr('app.infrastructure.adapters.feishu.client.FeishuClient', lambda: feishu_client)

    request_obj = SimpleNamespace(
        context=SimpleNamespace(chat_id='oc_p2p', open_id='ou_1'),
        message='查询订单',
        history=None,
    )
    channel = MagicMock()
    channel.to_agent_request.return_value = request_obj
    channel.send_thinking_card.return_value = 'card-1'
    monkeypatch.setattr('app.interfaces.channels.feishu_channel.FeishuChannel', lambda feishu_client: channel)

    memory = MagicMock()
    memory.load.return_value = [{'role': 'user', 'content': '历史问题'}]
    monkeypatch.setattr('app.application.agent.services.conversation_memory.ConversationMemory', lambda redis: memory)

    log_entry = MagicMock()
    log_entry.id = 88
    monkeypatch.setattr('app.domain.entities.agent_query_log.AgentQueryLog', lambda **kwargs: log_entry)
    monkeypatch.setattr('app.application.agent.agent_factory.get_data_agent_service', lambda **kwargs: agent_service)

    return {
        'container': container,
        'session': session,
        'feishu_client': feishu_client,
        'channel': channel,
        'memory': memory,
        'request_obj': request_obj,
        'log_entry': log_entry,
    }


def test_feishu_run_agent_covers_success_path(monkeypatch):
    response = SimpleNamespace(text='查询结果', sql='SELECT 1', usage={'tokens': 3})
    agent_service = MagicMock()

    def _run(request, on_progress=None):
        if on_progress:
            on_progress('planning')
        return response

    agent_service.run.side_effect = _run
    runtime = _prepare_feishu_agent_runtime(monkeypatch, agent_service=agent_service)

    feishu_api._run_feishu_agent(
        event={'message': {'chat_id': 'oc_p2p'}},
        config={'allowed_user_ids': []},
    )

    assert runtime['request_obj'].history == [{'role': 'user', 'content': '历史问题'}]
    runtime['log_entry'].mark_running.assert_called_once()
    runtime['log_entry'].mark_success.assert_called_once()
    runtime['memory'].append.assert_called_once()
    runtime['channel'].update_progress_card.assert_called_once_with('card-1', 'planning')
    runtime['channel'].deliver_response.assert_called_once()


def test_feishu_run_agent_covers_missing_service_branch(monkeypatch):
    runtime = _prepare_feishu_agent_runtime(monkeypatch, agent_service=None)

    feishu_api._run_feishu_agent(
        event={'message': {'chat_id': 'oc_p2p'}},
        config={'allowed_user_ids': []},
    )

    runtime['log_entry'].mark_error.assert_called_once_with('CUBIC3 智能问数尚未配置')
    runtime['feishu_client'].send_text_message.assert_called_once_with(
        'oc_p2p',
        'CUBIC3 智能问数尚未配置，请联系管理员。',
    )


def test_feishu_run_agent_covers_exception_branch(monkeypatch):
    agent_service = MagicMock()
    agent_service.run.side_effect = RuntimeError('boom')
    runtime = _prepare_feishu_agent_runtime(monkeypatch, agent_service=agent_service)

    feishu_api._run_feishu_agent(
        event={'message': {'chat_id': 'oc_p2p'}},
        config={'allowed_user_ids': []},
    )

    runtime['log_entry'].mark_error.assert_called_once()
    runtime['feishu_client'].send_text_message.assert_called_once_with(
        'oc_p2p',
        '抱歉，处理您的问题时遇到了错误。',
    )


def test_feishu_handle_p2p_agent_covers_rate_limit_branch(monkeypatch):
    container = MagicMock()
    container.redis_client.return_value = MagicMock()
    monkeypatch.setattr(feishu_api, 'get_container', lambda: container)
    monkeypatch.setattr(
        'app.application.agent.agent_factory.get_data_agent_config',
        lambda: {'allowed_user_ids': []},
    )
    monkeypatch.setattr(
        'app.shared.utils.rate_limiter.check_rate_limit',
        lambda *args, **kwargs: (False, {'current': 11, 'retry_after': 12}),
    )
    feishu_client = MagicMock()
    monkeypatch.setattr('app.infrastructure.adapters.feishu.client.FeishuClient', lambda: feishu_client)

    app = Flask(__name__)
    app.config['TESTING'] = True
    with app.test_request_context('/api/v1/feishu/events'):
        response, status = feishu_api._handle_p2p_agent(
            {
                'sender': {'sender_id': {'open_id': 'ou_1'}},
                'message': {'chat_id': 'oc_p2p', 'content': '{"text":"你好"}'},
            },
            {},
        )

    assert status == 200
    assert response.get_json()['data']['status'] == 'ok'
    feishu_client.send_text_message.assert_called_once_with('oc_p2p', '查询频率过高，请 12 秒后再试。')


def test_feishu_handle_p2p_agent_dispatches_async_task(monkeypatch):
    container = MagicMock()
    container.redis_client.return_value = MagicMock()
    monkeypatch.setattr(feishu_api, 'get_container', lambda: container)
    monkeypatch.setattr(
        'app.application.agent.agent_factory.get_data_agent_config',
        lambda: {'allowed_user_ids': []},
    )
    monkeypatch.setattr(
        'app.shared.utils.rate_limiter.check_rate_limit',
        lambda *args, **kwargs: (True, {'current': 1, 'retry_after': 0}),
    )

    class ImmediateThread:
        def __init__(self, target=None, args=(), kwargs=None):
            self.target = target
            self.args = args
            self.kwargs = kwargs or {}
            self.daemon = False

        def start(self):
            if self.target:
                self.target(*self.args, **self.kwargs)

    run_agent = MagicMock()
    monkeypatch.setattr(feishu_api.threading, 'Thread', ImmediateThread)
    monkeypatch.setattr(feishu_api, '_run_feishu_agent', run_agent)

    app = Flask(__name__)
    app.config['TESTING'] = True
    with app.test_request_context('/api/v1/feishu/events'):
        response, status = feishu_api._handle_p2p_agent(
            {
                'sender': {'sender_id': {'open_id': 'ou_1'}},
                'message': {'chat_id': 'oc_p2p', 'content': '{"text":"你好"}'},
            },
            {'trace': 'full'},
        )

    assert status == 200
    assert response.get_json()['data']['status'] == 'ok'
    run_agent.assert_called_once()
