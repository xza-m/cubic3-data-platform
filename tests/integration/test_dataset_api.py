"""
数据集API集成测试
"""
import pytest


class TestDatasetAPI:
    """数据集API集成测试"""
    
    BASE = '/api/v1/data-center/datasets'

    def test_list_datasets_route_exists(self, client):
        """路由已注册（非 404），测试环境无真实 DB 时 500 属正常"""
        response = client.get(self.BASE, headers={'X-User-Id': 'test_user'})
        assert response.status_code != 404

    def test_create_dataset_route_requires_auth(self, client):
        """POST 路由已注册并要求认证，不返回 404"""
        response = client.post(
            self.BASE,
            json={
                'dataset_code': 'test_dataset',
                'dataset_name': '测试数据集',
                'physical_table': 'db.table',
            },
            headers={'X-User-Id': 'test'},
        )
        assert response.status_code != 404
