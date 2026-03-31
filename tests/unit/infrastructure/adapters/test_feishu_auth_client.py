"""
飞书 OAuth 客户端测试
"""
from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.adapters.feishu.auth_client import FeishuAuthClient


@pytest.fixture
def app_with_feishu_auth_config(app):
    app.config['FEISHU_APP_ID'] = 'cli_app_id'
    app.config['FEISHU_APP_SECRET'] = 'cli_secret'
    app.config['FEISHU_TIMEOUT'] = 5
    return app


class TestFeishuAuthClient:
    def test_get_app_access_token_success(self, app_with_feishu_auth_config):
        with app_with_feishu_auth_config.app_context():
            client = FeishuAuthClient()
            with patch('app.infrastructure.adapters.feishu.auth_client.requests.post') as mock_post:
                response = MagicMock()
                response.json.return_value = {
                    'code': 0,
                    'app_access_token': 'app_token',
                }
                response.raise_for_status = MagicMock()
                mock_post.return_value = response

                assert client._get_app_access_token() == 'app_token'

    def test_get_app_access_token_raises_on_nonzero_code(self, app_with_feishu_auth_config):
        with app_with_feishu_auth_config.app_context():
            client = FeishuAuthClient()
            with patch('app.infrastructure.adapters.feishu.auth_client.requests.post') as mock_post:
                response = MagicMock()
                response.json.return_value = {'code': 999, 'msg': 'invalid'}
                response.raise_for_status = MagicMock()
                mock_post.return_value = response

                with pytest.raises(RuntimeError, match='获取 app_access_token 失败'):
                    client._get_app_access_token()

    def test_get_user_access_token_success(self, app_with_feishu_auth_config):
        with app_with_feishu_auth_config.app_context():
            client = FeishuAuthClient()
            with patch.object(client, '_get_app_access_token', return_value='app_token'):
                with patch('app.infrastructure.adapters.feishu.auth_client.requests.post') as mock_post:
                    response = MagicMock()
                    response.json.return_value = {
                        'code': 0,
                        'data': {'access_token': 'user_token', 'open_id': 'ou_xxx'},
                    }
                    response.raise_for_status = MagicMock()
                    mock_post.return_value = response

                    data = client.get_user_access_token('auth_code')

                    assert data['access_token'] == 'user_token'
                    assert data['open_id'] == 'ou_xxx'

    def test_get_user_access_token_raises_on_nonzero_code(self, app_with_feishu_auth_config):
        with app_with_feishu_auth_config.app_context():
            client = FeishuAuthClient()
            with patch.object(client, '_get_app_access_token', return_value='app_token'):
                with patch('app.infrastructure.adapters.feishu.auth_client.requests.post') as mock_post:
                    response = MagicMock()
                    response.json.return_value = {'code': 999, 'msg': 'bad code'}
                    response.raise_for_status = MagicMock()
                    mock_post.return_value = response

                    with pytest.raises(RuntimeError, match='换取 user_access_token 失败'):
                        client.get_user_access_token('auth_code')

    def test_get_user_info_success(self, app_with_feishu_auth_config):
        with app_with_feishu_auth_config.app_context():
            client = FeishuAuthClient()
            with patch('app.infrastructure.adapters.feishu.auth_client.requests.get') as mock_get:
                response = MagicMock()
                response.json.return_value = {
                    'code': 0,
                    'data': {'open_id': 'ou_xxx', 'name': 'Alice'},
                }
                response.raise_for_status = MagicMock()
                mock_get.return_value = response

                data = client.get_user_info('user_token')

                assert data == {'open_id': 'ou_xxx', 'name': 'Alice'}

    def test_get_user_info_raises_on_nonzero_code(self, app_with_feishu_auth_config):
        with app_with_feishu_auth_config.app_context():
            client = FeishuAuthClient()
            with patch('app.infrastructure.adapters.feishu.auth_client.requests.get') as mock_get:
                response = MagicMock()
                response.json.return_value = {'code': 123, 'msg': 'denied'}
                response.raise_for_status = MagicMock()
                mock_get.return_value = response

                with pytest.raises(RuntimeError, match='获取用户信息失败'):
                    client.get_user_info('user_token')
