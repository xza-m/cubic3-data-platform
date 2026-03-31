"""
Superset Client 单元测试

Mock HTTP 请求，测试登录、截图、获取标题等
"""
import pytest
from unittest.mock import MagicMock, patch

from app.infrastructure.adapters.superset.client import SupersetClient


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def app_with_superset_config(app):
    """带 Superset 配置的 Flask 应用"""
    app.config["SUPERSET_BASE_URL"] = "http://superset:8088"
    app.config["SUPERSET_USERNAME"] = "admin"
    app.config["SUPERSET_PASSWORD"] = "admin"
    app.config["SUPERSET_JWT"] = None
    return app


@pytest.fixture
def app_with_jwt_config(app):
    """使用 JWT 的配置"""
    app.config["SUPERSET_BASE_URL"] = "http://superset:8088"
    app.config["SUPERSET_JWT"] = "jwt_token_123"
    app.config["SUPERSET_USERNAME"] = None
    app.config["SUPERSET_PASSWORD"] = None
    return app


# ============================================================================
# 构造函数与配置
# ============================================================================


class TestSupersetClientInit:
    def test_init_stores_config(self, app_with_superset_config):
        """构造函数正确存储配置"""
        with app_with_superset_config.app_context():
            client = SupersetClient()
            assert client.base_url == "http://superset:8088"
            assert client.username == "admin"
            assert client.password == "admin"
            assert client.jwt is None

    def test_init_with_jwt(self, app_with_jwt_config):
        """JWT 模式下不依赖用户名密码"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            assert client.jwt == "jwt_token_123"
            assert client.username is None

    def test_init_viewport_defaults(self, app_with_superset_config):
        """viewport 默认值"""
        with app_with_superset_config.app_context():
            client = SupersetClient()
            assert client.viewport_width == 1920
            assert client.viewport_height == 1080

    def test_init_viewport_custom(self, app_with_superset_config):
        """自定义 viewport"""
        app_with_superset_config.config["SUPERSET_VIEWPORT_WIDTH"] = 1280
        app_with_superset_config.config["SUPERSET_VIEWPORT_HEIGHT"] = 720
        with app_with_superset_config.app_context():
            client = SupersetClient()
            assert client.viewport_width == 1280
            assert client.viewport_height == 720


# ============================================================================
# 认证与登录
# ============================================================================


class TestSupersetClientAuth:
    def test_auth_header_with_jwt(self, app_with_jwt_config):
        """JWT 模式直接返回 Bearer token"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            header = client._auth_header()
            assert header == {"Authorization": "Bearer jwt_token_123"}

    def test_auth_header_with_login(self, app_with_superset_config):
        """用户名密码模式调用 _login"""
        with app_with_superset_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "post") as mock_post:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {"access_token": "access_xyz"}
                mock_resp.raise_for_status = MagicMock()
                mock_post.return_value = mock_resp

                header = client._auth_header()
                assert header == {"Authorization": "Bearer access_xyz"}
                mock_post.assert_called_once()
                call_args = mock_post.call_args
                assert "login" in call_args[0][0]

    def test_login_failure_raises(self, app_with_superset_config):
        """登录失败时抛出异常"""
        import requests

        with app_with_superset_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "post") as mock_post:
                mock_resp = MagicMock()
                mock_resp.raise_for_status.side_effect = requests.HTTPError("401")
                mock_post.return_value = mock_resp

                with pytest.raises(requests.HTTPError):
                    client._auth_header()

    def test_csrf_header_returns_empty_for_jwt(self, app_with_jwt_config):
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            assert client._csrf_header() == {}

    def test_csrf_header_returns_cached_token(self, app_with_superset_config):
        with app_with_superset_config.app_context():
            client = SupersetClient()
            client._csrf_token = "csrf_cached"

            assert client._csrf_header() == {"X-CSRFToken": "csrf_cached"}

    def test_csrf_header_fetches_and_caches_token(self, app_with_superset_config):
        with app_with_superset_config.app_context():
            client = SupersetClient()
            client._access_token = "access_xyz"

            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {"result": "csrf_new"}
                mock_resp.raise_for_status = MagicMock()
                mock_get.return_value = mock_resp

                header = client._csrf_header()

        assert header == {"X-CSRFToken": "csrf_new"}
        assert client._csrf_token == "csrf_new"

    def test_csrf_header_returns_empty_when_token_missing(self, app_with_superset_config):
        with app_with_superset_config.app_context():
            client = SupersetClient()
            client._access_token = "access_xyz"

            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {}
                mock_resp.raise_for_status = MagicMock()
                mock_get.return_value = mock_resp

                header = client._csrf_header()

        assert header == {}


# ============================================================================
# 辅助方法
# ============================================================================


class TestSupersetClientHelpers:
    def test_build_screenshot_digest(self, app_with_superset_config):
        """_build_screenshot_digest 生成 MD5"""
        with app_with_superset_config.app_context():
            client = SupersetClient()
            digest = client._build_screenshot_digest({"a": 1, "b": 2})
            assert isinstance(digest, str)
            assert len(digest) == 32

    def test_dashboard_url_path_with_template(self, app_with_superset_config):
        """使用模板时返回模板格式化结果"""
        app_with_superset_config.config["SUPERSET_DASHBOARD_URL_TEMPLATE"] = "/dash/{id}/"
        with app_with_superset_config.app_context():
            client = SupersetClient()
            path = client._dashboard_url_path("123")
            assert path == "/dash/123/"

    def test_dashboard_url_path_with_base_path(self, app_with_superset_config):
        """有 base_path 时使用标准路径"""
        with app_with_superset_config.app_context():
            client = SupersetClient()
            path = client._dashboard_url_path("456")
            assert "superset/dashboard/456" in path

    def test_dashboard_url_path_falls_back_when_template_invalid(self, app_with_superset_config):
        app_with_superset_config.config["SUPERSET_DASHBOARD_URL_TEMPLATE"] = "/dash/{unknown}/"
        with app_with_superset_config.app_context():
            client = SupersetClient()
            path = client._dashboard_url_path("456")

        assert path == "/superset/dashboard/456/"

    def test_get_screenshot_cache_key_wraps_http_error(self, app_with_jwt_config):
        import requests

        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "post") as mock_post:
                mock_resp = MagicMock()
                mock_resp.text = "bad request"
                mock_resp.status_code = 400
                mock_resp.raise_for_status.side_effect = requests.HTTPError("boom", response=mock_resp)
                mock_post.return_value = mock_resp

                with pytest.raises(requests.HTTPError, match="body=bad request"):
                    client._get_screenshot_cache_key("1", {"force": True}, timeout=5)

    def test_get_screenshot_cache_key_raises_when_payload_has_no_key(self, app_with_jwt_config):
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "post") as mock_post:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {}
                mock_resp.raise_for_status = MagicMock()
                mock_post.return_value = mock_resp

                with pytest.raises(RuntimeError, match="返回为空"):
                    client._get_screenshot_cache_key("1", {"force": True}, timeout=5)

    @pytest.mark.parametrize("status_code", [202, 404])
    def test_fetch_screenshot_returns_none_when_not_ready(self, app_with_jwt_config, status_code):
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock(status_code=status_code)
                mock_get.return_value = mock_resp

                assert client._fetch_screenshot_by_cache_key("1", "cache", timeout=5, attempt=1) is None

    def test_fetch_screenshot_raises_on_unexpected_error(self, app_with_jwt_config):
        import requests

        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock(status_code=500, text="boom")
                mock_resp.raise_for_status.side_effect = requests.HTTPError("500")
                mock_get.return_value = mock_resp

                with pytest.raises(requests.HTTPError, match="500"):
                    client._fetch_screenshot_by_cache_key("1", "cache", timeout=5, attempt=1)


# ============================================================================
# get_dashboard_title
# ============================================================================


class TestGetDashboardTitle:
    def test_get_dashboard_title_success(self, app_with_jwt_config):
        """成功获取 dashboard 标题"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {
                    "result": {"dashboard_title": "销售看板", "title": "Sales"}
                }
                mock_resp.raise_for_status = MagicMock()
                mock_get.return_value = mock_resp

                title = client.get_dashboard_title("1")
                assert title == "销售看板"

    def test_get_dashboard_title_fallback_to_title(self, app_with_jwt_config):
        """dashboard_title 为空时使用 title"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {"result": {"title": "Fallback Title"}}
                mock_resp.raise_for_status = MagicMock()
                mock_get.return_value = mock_resp

                title = client.get_dashboard_title("1")
                assert title == "Fallback Title"

    def test_get_dashboard_title_not_found_raises(self, app_with_jwt_config):
        """标题不存在时抛出 RuntimeError"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client.session, "get") as mock_get:
                mock_resp = MagicMock()
                mock_resp.json.return_value = {"result": {}}
                mock_resp.raise_for_status = MagicMock()
                mock_get.return_value = mock_resp

                with pytest.raises(RuntimeError, match="Dashboard title not found"):
                    client.get_dashboard_title("1")


# ============================================================================
# get_dashboard_screenshot
# ============================================================================


class TestGetDashboardScreenshot:
    def test_get_screenshot_success(self, app_with_jwt_config):
        """成功获取截图"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            with patch.object(client, "_get_screenshot_cache_key", return_value="cache_key_123"):
                with patch.object(client, "_fetch_screenshot_by_cache_key") as mock_fetch:
                    mock_fetch.return_value = b"fake_png_bytes"

                    result = client.get_dashboard_screenshot("1", timeout=5, retries=1)
                    assert result == b"fake_png_bytes"

    def test_get_screenshot_retries_until_ready(self, app_with_jwt_config):
        """轮询直到截图就绪"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            client.screenshot_max_wait = 2
            client.screenshot_poll_interval = 0.1
            with patch.object(client, "_get_screenshot_cache_key", return_value="key"):
                with patch.object(client, "_fetch_screenshot_by_cache_key") as mock_fetch:
                    mock_fetch.side_effect = [None, None, b"ready"]

                    result = client.get_dashboard_screenshot("1", timeout=5, retries=1)
                    assert result == b"ready"
                    assert mock_fetch.call_count == 3

    def test_get_screenshot_timeout_raises(self, app_with_jwt_config):
        """超时后抛出 RuntimeError"""
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            client.screenshot_max_wait = 0.1
            client.screenshot_poll_interval = 0.05
            with patch.object(client, "_get_screenshot_cache_key", return_value="key"):
                with patch.object(client, "_fetch_screenshot_by_cache_key", return_value=None):
                    with pytest.raises(RuntimeError, match="not ready after retries"):
                        client.get_dashboard_screenshot("1", timeout=5, retries=1)

    def test_get_screenshot_retries_after_initial_400(self, app_with_jwt_config):
        import requests

        with app_with_jwt_config.app_context():
            client = SupersetClient()
            client.screenshot_max_wait = 0.1
            client.screenshot_poll_interval = 0.01
            response = MagicMock(status_code=400)
            error = requests.HTTPError("400", response=response)

            with patch.object(client, "_get_screenshot_cache_key", side_effect=[error, "key"]) as mock_cache:
                with patch.object(client, "_fetch_screenshot_by_cache_key", return_value=b"png"):
                    result = client.get_dashboard_screenshot("1", timeout=5)

        assert result == b"png"
        assert mock_cache.call_count == 2

    def test_get_screenshot_raises_last_poll_exception(self, app_with_jwt_config):
        with app_with_jwt_config.app_context():
            client = SupersetClient()
            client.screenshot_max_wait = 0.1
            client.screenshot_poll_interval = 0.01

            with patch.object(client, "_get_screenshot_cache_key", return_value="key"):
                with patch.object(client, "_fetch_screenshot_by_cache_key", side_effect=RuntimeError("fetch failed")):
                    with pytest.raises(RuntimeError, match="fetch failed"):
                        client.get_dashboard_screenshot("1", timeout=5)
