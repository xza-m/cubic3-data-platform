"""
API 路由烟测：验证各 Blueprint 已注册且能响应（非 404）。
不测试业务逻辑，仅覆盖路由注册与认证中间件。
"""
import pytest

AUTH_HEADERS = {'Authorization': 'Bearer test'}


class TestHealthRoutes:
    """健康检查"""

    def test_health_get(self, client):
        r = client.get('/health', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestAuthRoutes:
    """认证 API"""

    def test_auth_me_get(self, client):
        r = client.get('/api/v1/auth/me', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestDatasourcesRoutes:
    """数据源 API"""

    def test_datasources_list_get(self, client):
        r = client.get('/api/v1/data-center/datasources', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_datasources_create_post(self, client):
        r = client.post(
            '/api/v1/data-center/datasources',
            json={'name': 'x', 'source_type': 'maxcompute', 'connection_config': {}},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404

    def test_datasources_sync_catalog_post(self, client):
        r = client.post('/api/v1/data-center/datasources/1/sync-catalog', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestDatasetsRoutes:
    """数据集 API"""

    def test_datasets_list_get(self, client):
        r = client.get('/api/v1/data-center/datasets', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_datasets_create_post(self, client):
        r = client.post(
            '/api/v1/data-center/datasets',
            json={
                'dataset_name': 'x',
                'source_id': 1,
                'physical_table': 't',
                'fields': [{'physical_name': 'a', 'data_type': 'STRING'}],
            },
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404

    def test_datasets_sync_schema_post(self, client):
        r = client.post('/api/v1/data-center/datasets/1/sync-schema', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestExtractionRoutes:
    """提取任务 API"""

    def test_extraction_tasks_list_get(self, client):
        r = client.get('/api/v1/extraction/tasks', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_extraction_tasks_create_post(self, client):
        r = client.post(
            '/api/v1/extraction/tasks',
            json={'task_name': 'x', 'dataset_id': 1, 'select_fields': [], 'filter_conditions': {}},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestConversationsRoutes:
    """会话 API"""

    def test_conversations_list_get(self, client):
        r = client.get('/api/v1/conversations', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_conversations_create_post(self, client):
        r = client.post(
            '/api/v1/conversations',
            json={'title': 'x'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestFilesRoutes:
    """文件 API（仅 POST /upload）"""

    def test_files_upload_post(self, client):
        r = client.post('/api/v1/files/upload', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestSqlLabRoutes:
    """SQL Lab API（url_prefix 为 sql_lab）"""

    def test_sql_lab_execute_post(self, client):
        r = client.post(
            '/api/v1/sql_lab/execute',
            json={'source_id': 1, 'sql_query': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestQueriesRoutes:
    """查询中心 API"""

    def test_queries_list_get(self, client):
        r = client.get('/api/v1/queries', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_queries_create_post(self, client):
        r = client.post(
            '/api/v1/queries',
            json={'query_name': 'x', 'source_id': 1, 'sql_query': 'SELECT 1'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestFeishuRoutes:
    """飞书 API"""

    def test_feishu_chats_get(self, client):
        r = client.get('/api/v1/feishu/chats', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestAppsRoutes:
    """应用市场 API"""

    def test_apps_list_get(self, client):
        r = client.get('/api/v1/apps', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestAppInstancesRoutes:
    """应用实例 API"""

    def test_app_instances_list_get(self, client):
        r = client.get('/api/v1/app-instances', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_app_instances_create_post(self, client):
        r = client.post(
            '/api/v1/app-instances',
            json={'app_code': 'x', 'name': 'x'},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestAppExecutionsRoutes:
    """应用执行 API"""

    def test_app_executions_list_get(self, client):
        r = client.get('/api/v1/app-executions', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestChannelsRoutes:
    """渠道 API"""

    def test_channels_list_get(self, client):
        r = client.get('/api/v1/channels', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_channels_create_post(self, client):
        r = client.post(
            '/api/v1/channels',
            json={'name': 'x', 'channel_type': 'feishu_group', 'config': {}},
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestSubscriptionsRoutes:
    """订阅 API"""

    def test_subscriptions_list_get(self, client):
        r = client.get('/api/v1/subscriptions', headers=AUTH_HEADERS)
        assert r.status_code != 404

    def test_subscriptions_create_post(self, client):
        r = client.post(
            '/api/v1/subscriptions',
            json={
                'name': 'x',
                'app_instance_id': 1,
                'channel_id': 1,
                'event_types': [],
            },
            headers=AUTH_HEADERS,
        )
        assert r.status_code != 404


class TestAppInstanceSubscriptionsRoutes:
    """应用实例订阅子路由"""

    def test_instance_subscriptions_get(self, client):
        r = client.get('/api/v1/app-instances/1/subscriptions', headers=AUTH_HEADERS)
        assert r.status_code != 404


class TestSemanticRoutes:
    """语义层 API"""

    def test_semantic_cubes_list_get(self, client):
        r = client.get('/api/v1/semantic/cubes', headers=AUTH_HEADERS)
        assert r.status_code != 404
