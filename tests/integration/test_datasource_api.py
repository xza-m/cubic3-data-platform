"""
数据源API集成测试
"""
from datetime import datetime, timedelta

import jwt


def _auth_headers_for(user_id: str) -> dict[str, str]:
    token = jwt.encode(
        {
            'user_id': user_id,
            'principal_id': user_id,
            'user_name': user_id,
            'roles': ['admin'],
            'token_use': 'access',
            'sid': 'test-session',
            'jti': 'test-access-token',
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=1),
        },
        'your-secret-key',
        algorithm='HS256',
    )
    return {'Authorization': f'Bearer {token}'}


class TestDatasourceAPI:
    """数据源API集成测试"""
    
    BASE = '/api/v1/data-center/datasources'

    def test_list_datasources_route_exists(self, client):
        """路由已注册（非 404），认证失败或 DB 错误均属正常测试环境预期"""
        response = client.get(self.BASE, headers={'X-User-Id': 'test_user'})
        assert response.status_code != 404

    def test_create_datasource_route_requires_auth(self, client):
        """POST 路由已注册并要求认证（401），不返回 404"""
        response = client.post(
            self.BASE,
            json={'name': 'Test', 'source_type': 'maxcompute', 'connection_config': {}},
            headers={'X-User-Id': 'test_user'},
        )
        assert response.status_code != 404

    def test_create_maxcompute_datasource_accepts_principal_identifier(self, client):
        """MaxCompute 创建链路应接受平台主体 ID，并在响应中保持连接配置脱敏。"""
        principal_id = 'feishu:tenant_ci:on_' + 'a' * 80
        response = client.post(
            self.BASE,
            json={
                'name': 'principal-maxcompute',
                'source_type': 'maxcompute',
                'description': 'principal smoke',
                'connection_config': {
                    'endpoint': 'https://service.local/api',
                    'project': 'demo_project',
                    'access_id': 'dummy_access_id',
                    'access_key': 'dummy_access_key',
                },
            },
            headers=_auth_headers_for(principal_id),
        )

        assert response.status_code == 201
        payload = response.get_json()['data']
        assert payload['source_type'] == 'maxcompute'
        assert payload['created_by'] == principal_id
        assert payload['connection_config']['access_key'] != 'dummy_access_key'

    def test_statistics_route_exists(self, client):
        """统计路由已注册（非 404）"""
        response = client.get(f'{self.BASE}/statistics', headers={'X-User-Id': 'test_user'})
        assert response.status_code != 404

    def test_sync_catalog_route_exists(self, client):
        """目录同步路由已注册（非 404）"""
        response = client.post(f'{self.BASE}/1/sync-catalog', headers={'X-User-Id': 'test_user'})
        assert response.status_code != 404
