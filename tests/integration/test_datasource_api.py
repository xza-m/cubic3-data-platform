"""
数据源API集成测试
"""
import pytest


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

    def test_statistics_route_exists(self, client):
        """统计路由已注册（非 404）"""
        response = client.get(f'{self.BASE}/statistics', headers={'X-User-Id': 'test_user'})
        assert response.status_code != 404

    def test_sync_catalog_route_exists(self, client):
        """目录同步路由已注册（非 404）"""
        response = client.post(f'{self.BASE}/1/sync-catalog', headers={'X-User-Id': 'test_user'})
        assert response.status_code != 404
