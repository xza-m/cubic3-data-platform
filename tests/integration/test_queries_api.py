"""
查询中心 API 烟测：覆盖 queries 模块所有路由。
"""
import pytest

AUTH_HEADERS = {'Authorization': 'Bearer test'}
BASE = '/api/v1/queries'


class TestQueriesExecute:
    """执行查询"""

    def test_execute_post(self, client):
        r = client.post(
            f'{BASE}/execute',
            json={'source_id': 1, 'sql_query': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestQueriesCrud:
    """查询 CRUD"""

    def test_list_get(self, client):
        r = client.get(BASE, headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_create_post(self, client):
        r = client.post(
            BASE,
            json={'query_name': 'x', 'source_id': 1, 'sql_query': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404

    def test_get_detail(self, client):
        r = client.get(f'{BASE}/1', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_update_put(self, client):
        r = client.put(
            f'{BASE}/1',
            json={'query_name': 'x', 'sql_query': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404

    def test_delete(self, client):
        r = client.delete(f'{BASE}/1', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestQueriesFavorite:
    """收藏"""

    def test_toggle_favorite_post(self, client):
        r = client.post(f'{BASE}/1/favorite', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestQueriesFolders:
    """文件夹"""

    def test_folders_list_get(self, client):
        r = client.get(f'{BASE}/folders', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_folders_create_post(self, client):
        r = client.post(
            f'{BASE}/folders',
            json={'folder_name': 'x'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestQueriesHistories:
    """历史记录"""

    def test_histories_list_get(self, client):
        r = client.get(f'{BASE}/histories', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestQueriesStatistics:
    """统计"""

    def test_statistics_get(self, client):
        r = client.get(f'{BASE}/statistics', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestQueriesTemplates:
    """查询模板"""

    def test_templates_list_get(self, client):
        r = client.get(f'{BASE}/templates', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_templates_create_post(self, client):
        r = client.post(
            f'{BASE}/templates',
            json={'template_name': 'x', 'sql_template': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404

    def test_template_detail_get(self, client):
        r = client.get(f'{BASE}/templates/1', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_template_update_put(self, client):
        r = client.put(
            f'{BASE}/templates/1',
            json={'template_name': 'x', 'sql_template': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404

    def test_template_delete(self, client):
        r = client.delete(f'{BASE}/templates/1', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_template_use_post(self, client):
        r = client.post(f'{BASE}/templates/1/use', json={}, headers=AUTH_HEADERS)
        assert r.status_code != 404
