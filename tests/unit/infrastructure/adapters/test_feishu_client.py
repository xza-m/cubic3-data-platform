import json
from types import SimpleNamespace
from unittest.mock import MagicMock, mock_open, patch

import pytest
import requests

from app.infrastructure.adapters.feishu.client import FeishuClient


@pytest.fixture
def app_with_feishu_config(app):
    app.config.update(
        FEISHU_TIMEOUT=5,
        FEISHU_RETRY_MAX=3,
        FEISHU_RETRY_BACKOFF=1,
        FEISHU_APP_ID="app-id",
        FEISHU_APP_SECRET="app-secret",
    )
    return app


def _response(status_code=200, payload=None, text=""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.content = b"content"
    resp.json.return_value = payload or {}
    resp.raise_for_status = MagicMock()
    return resp


class TestFeishuClientBase:
    def test_init_reads_config(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()

        assert client.timeout == 5
        assert client.retry_max == 3
        assert client.backoff == 1
        assert client.app_id == "app-id"
        assert client.app_secret == "app-secret"

    def test_post_with_retry_returns_on_success(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            resp = _response(status_code=200, payload={"ok": True})

            with patch("app.infrastructure.adapters.feishu.client.requests.post", return_value=resp) as mock_post:
                result = client._post_with_retry("https://example.test", json={"x": 1})

        assert result is resp
        mock_post.assert_called_once_with(
            "https://example.test",
            timeout=5,
            json={"x": 1},
        )

    def test_post_with_retry_retries_until_success(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            boom = requests.ConnectionError("boom")
            success = _response(status_code=200, payload={"ok": True})

            with patch("app.infrastructure.adapters.feishu.client.requests.post", side_effect=[boom, success]) as mock_post:
                with patch("app.infrastructure.adapters.feishu.client.time.sleep") as mock_sleep:
                    result = client._post_with_retry("https://retry.test")

        assert result is success
        assert mock_post.call_count == 2
        mock_sleep.assert_called_once_with(1)

    def test_post_with_retry_raises_last_client_error(self, app_with_feishu_config):
        error = requests.HTTPError("bad request")
        resp = _response(status_code=400)
        resp.raise_for_status.side_effect = error

        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch("app.infrastructure.adapters.feishu.client.requests.post", return_value=resp):
                with patch("app.infrastructure.adapters.feishu.client.time.sleep"):
                    with pytest.raises(requests.HTTPError, match="bad request"):
                        client._post_with_retry("https://retry.test")

    def test_post_with_retry_raises_runtime_error_when_only_server_errors(self, app_with_feishu_config):
        resp = _response(status_code=500)

        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch("app.infrastructure.adapters.feishu.client.requests.post", return_value=resp):
                with patch("app.infrastructure.adapters.feishu.client.time.sleep"):
                    with pytest.raises(RuntimeError, match="without exception detail"):
                        client._post_with_retry("https://retry.test")


class TestTenantToken:
    def test_get_tenant_token_uses_cache_before_expiry(self, app_with_feishu_config):
        token_resp = _response(payload={"code": 0, "tenant_access_token": "tenant-token", "expire": 3600})

        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch("app.infrastructure.adapters.feishu.client.requests.post", return_value=token_resp) as mock_post:
                with patch("app.infrastructure.adapters.feishu.client.time.time", side_effect=[1000, 1100]):
                    first = client._get_tenant_token()
                    second = client._get_tenant_token()

        assert first == second == "tenant-token"
        mock_post.assert_called_once()

    def test_get_tenant_token_raises_on_nonzero_code(self, app_with_feishu_config):
        token_resp = _response(payload={"code": 999, "msg": "denied"})

        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch("app.infrastructure.adapters.feishu.client.requests.post", return_value=token_resp):
                with pytest.raises(RuntimeError, match="Feishu token failed"):
                    client._get_tenant_token()


class TestFeishuClientOperations:
    def test_get_bot_info_success(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0, "bot": {"name": "bot"}})):
                    result = client.get_bot_info()

        assert result == {"name": "bot"}

    def test_get_bot_info_raises_on_nonzero_code(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 123})):
                    with pytest.raises(RuntimeError, match="Feishu bot info failed"):
                        client.get_bot_info()

    def test_get_chat_info_returns_chat_payload(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch("app.infrastructure.adapters.feishu.client.requests.get", return_value=_response(payload={"code": 0, "data": {"chat": {"name": "群聊"}}})):
                    result = client.get_chat_info("chat-1")

        assert result == {"name": "群聊"}

    def test_get_chat_info_returns_none_on_failure(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", side_effect=RuntimeError("no token")):
                assert client.get_chat_info("chat-1") is None

    def test_upload_image_success(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0, "data": {"image_key": "img-key"}})):
                    image_key = client.upload_image(b"png-bytes")

        assert image_key == "img-key"

    def test_upload_file_uses_file_name_and_returns_key(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0, "data": {"file_key": "file-key"}})) as mock_post:
                    with patch("builtins.open", mock_open(read_data=b"demo")):
                        file_key = client.upload_file("/tmp/report.csv", file_type="xls")

        assert file_key == "file-key"
        files = mock_post.call_args.kwargs["files"]
        assert files["file"][0] == "report.csv"
        assert mock_post.call_args.kwargs["data"] == {"file_type": "xls"}

    def test_upload_file_bytes_returns_key(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0, "data": {"file_key": "file-key"}})):
                    file_key = client.upload_file_bytes(b"file-bytes", "result.xlsx")

        assert file_key == "file-key"

    @pytest.mark.parametrize(
        ("method_name", "args", "error_message"),
        [
            ("send_file_message", ("chat-1", "file-key"), "Feishu send file message failed"),
            ("send_text_message", ("chat-1", "hello"), "Feishu send text message failed"),
            ("send_interactive_card", ("chat-1", {"header": {}}), "Feishu send interactive card failed"),
        ],
    )
    def test_message_methods_raise_on_nonzero_code(self, app_with_feishu_config, method_name, args, error_message):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 500})):
                    with pytest.raises(RuntimeError, match=error_message):
                        getattr(client, method_name)(*args)

    def test_send_interactive_card_returns_message_id(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0, "data": {"message_id": "msg-1"}})):
                    message_id = client.send_interactive_card("chat-1", {"header": {"title": "标题"}})

        assert message_id == "msg-1"

    def test_send_card_message_delegates_when_card_provided(self, app_with_feishu_config):
        card = {"header": {"title": "标题"}}

        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "send_interactive_card", return_value="msg-1") as mock_send:
                message_id = client.send_card_message("chat-1", card=card)

        assert message_id == "msg-1"
        mock_send.assert_called_once_with("chat-1", card)

    def test_send_card_message_builds_link_button(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0})) as mock_post:
                    client.send_card_message("chat-1", title="日报", content="内容", link="https://detail.test")

        content = json.loads(mock_post.call_args.kwargs["json"]["content"])
        assert content["header"]["title"]["content"] == "日报"
        assert content["elements"][1]["actions"][0]["url"] == "https://detail.test"

    def test_send_dashboard_uploads_image_and_builds_trace_lines(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "upload_image", return_value="img-key") as mock_upload:
                with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                    with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 0})) as mock_post:
                        client.send_dashboard(
                            "chat-1",
                            b"png",
                            title="销售日报",
                            link="https://detail.test",
                            trace_id="trace-1",
                        )

        mock_upload.assert_called_once_with(b"png")
        content = json.loads(mock_post.call_args.kwargs["json"]["content"])
        assert "trace_id: trace-1" in content["elements"][0]["text"]["content"]
        assert "查看详情: https://detail.test" in content["elements"][0]["text"]["content"]
        assert content["elements"][1]["img_key"] == "img-key"

    def test_send_dashboard_raises_on_nonzero_code(self, app_with_feishu_config):
        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "upload_image", return_value="img-key"):
                with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                    with patch.object(client, "_post_with_retry", return_value=_response(payload={"code": 500})):
                        with pytest.raises(RuntimeError, match="Feishu send failed"):
                            client.send_dashboard("chat-1", b"png", "日报", None, None)

    def test_update_message_success_and_failure_paths(self, app_with_feishu_config):
        success_resp = _response(status_code=200, payload={"code": 0})
        error_resp = _response(status_code=500, payload={"code": 0}, text="bad")
        code_error_resp = _response(status_code=200, payload={"code": 400})

        with app_with_feishu_config.app_context():
            client = FeishuClient()
            with patch.object(client, "_get_tenant_token", return_value="tenant-token"):
                with patch("app.infrastructure.adapters.feishu.client.requests.patch", return_value=success_resp):
                    client.update_message("msg-1", {"header": {"title": "标题"}})
                with patch("app.infrastructure.adapters.feishu.client.requests.patch", return_value=error_resp):
                    with pytest.raises(RuntimeError, match="Feishu update message failed"):
                        client.update_message("msg-1", {"header": {"title": "标题"}})
                with patch("app.infrastructure.adapters.feishu.client.requests.patch", return_value=code_error_resp):
                    with pytest.raises(RuntimeError, match="Feishu update message error"):
                        client.update_message("msg-1", {"header": {"title": "标题"}})
