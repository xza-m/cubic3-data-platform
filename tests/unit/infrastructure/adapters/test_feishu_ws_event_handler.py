import json
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import app.infrastructure.adapters.feishu.ws_event_handler as ws_handler


class InlineThread:
    def __init__(self, target, name=None, daemon=None):
        self.target = target
        self.name = name
        self.daemon = daemon

    def start(self):
        self.target()


@pytest.fixture
def app_with_feishu_config(app):
    app.config.update(
        FEISHU_APP_ID="app-id",
        FEISHU_APP_SECRET="app-secret",
    )
    return app


@pytest.fixture(autouse=True)
def reset_ws_client():
    original = ws_handler._ws_client
    ws_handler._ws_client = None
    yield
    ws_handler._ws_client = original


def _install_fake_lark(monkeypatch):
    callbacks = {}

    class FakeResponse(dict):
        pass

    class FakeBuilder:
        def register_p2_im_message_receive_v1(self, callback):
            callbacks["message"] = callback
            return self

        def register_p2_card_action_trigger(self, callback):
            callbacks["card"] = callback
            return self

        def build(self):
            return self

    class FakeEventDispatcherHandler:
        @staticmethod
        def builder(*_args):
            return FakeBuilder()

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs
            self.started = False

        def start(self):
            self.started = True

    lark_module = ModuleType("lark_oapi")
    lark_module.EventDispatcherHandler = FakeEventDispatcherHandler
    lark_module.ws = SimpleNamespace(Client=FakeClient)
    lark_module.LogLevel = SimpleNamespace(DEBUG="DEBUG")
    lark_module.JSON = SimpleNamespace(marshal=lambda data: json.dumps({"event": data.raw_event}))

    im_module = ModuleType("lark_oapi.api.im.v1")
    im_module.P2ImMessageReceiveV1 = object
    card_module = ModuleType("lark_oapi.event.callback.model.p2_card_action_trigger")
    card_module.P2CardActionTrigger = object
    card_module.P2CardActionTriggerResponse = FakeResponse

    monkeypatch.setitem(sys.modules, "lark_oapi", lark_module)
    monkeypatch.setitem(sys.modules, "lark_oapi.api.im.v1", im_module)
    monkeypatch.setitem(sys.modules, "lark_oapi.event.callback.model.p2_card_action_trigger", card_module)
    return callbacks


class TestSdkEventToDict:
    def test_sdk_event_to_dict_uses_sdk_json_first(self, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        _ = callbacks

        data = SimpleNamespace(raw_event={"message": {"chat_type": "p2p"}})
        result = ws_handler._sdk_event_to_dict(data)

        assert result == {"message": {"chat_type": "p2p"}}

    def test_sdk_event_to_dict_falls_back_to_manual_extraction(self, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        _ = callbacks
        monkeypatch.setattr(sys.modules["lark_oapi"].JSON, "marshal", lambda _data: (_ for _ in ()).throw(RuntimeError("boom")))

        data = SimpleNamespace(
            event=SimpleNamespace(
                sender=SimpleNamespace(
                    sender_id=SimpleNamespace(open_id="ou_1", user_id="u_1", union_id="uu_1"),
                    sender_type="user",
                ),
                message=SimpleNamespace(
                    message_id="m_1",
                    chat_id="c_1",
                    chat_type="p2p",
                    message_type="text",
                    content='{"text":"hi"}',
                ),
            )
        )

        result = ws_handler._sdk_event_to_dict(data)

        assert result["sender"]["sender_id"]["open_id"] == "ou_1"
        assert result["message"]["message_id"] == "m_1"


class TestProcessAgentMessage:
    def test_process_agent_message_skips_when_agent_disabled(self, app_with_feishu_config, monkeypatch):
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        with patch("app.application.agent.agent_factory.get_data_agent_config", return_value=None):
            with patch("app.interfaces.api.v1.feishu._run_feishu_agent") as mock_run:
                ws_handler._process_agent_message(app_with_feishu_config, {"sender": {"sender_id": {"open_id": "u1"}}})

        mock_run.assert_not_called()

    def test_process_agent_message_enforces_allow_list(self, app_with_feishu_config, monkeypatch):
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        with patch("app.application.agent.agent_factory.get_data_agent_config", return_value={"allowed_user_ids": ["u2"]}):
            with patch("app.interfaces.api.v1.feishu._run_feishu_agent") as mock_run:
                ws_handler._process_agent_message(app_with_feishu_config, {"sender": {"sender_id": {"open_id": "u1"}}})

        mock_run.assert_not_called()

    def test_process_agent_message_runs_agent_for_allowed_user(self, app_with_feishu_config, monkeypatch):
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)
        event_dict = {"sender": {"sender_id": {"open_id": "u1"}}, "message": {"chat_id": "c1"}}

        with patch("app.application.agent.agent_factory.get_data_agent_config", return_value={"allowed_user_ids": ["u1"]}):
            with patch("app.interfaces.api.v1.feishu._run_feishu_agent") as mock_run:
                ws_handler._process_agent_message(app_with_feishu_config, event_dict)

        mock_run.assert_called_once_with(event_dict, {"allowed_user_ids": ["u1"]})

    def test_process_agent_message_logs_worker_exception(self, app_with_feishu_config, monkeypatch):
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        with patch("app.application.agent.agent_factory.get_data_agent_config", return_value={"allowed_user_ids": []}):
            with patch("app.interfaces.api.v1.feishu._run_feishu_agent", side_effect=RuntimeError("boom")):
                with patch.object(ws_handler, "logger") as mock_logger:
                    ws_handler._process_agent_message(
                        app_with_feishu_config,
                        {"sender": {"sender_id": {"open_id": "u1"}}, "message": {"chat_id": "c1"}},
                    )

        mock_logger.error.assert_called_once()


class TestStartFeishuWs:
    def test_start_feishu_ws_skips_when_config_missing(self, app, monkeypatch):
        app.config.update(FEISHU_APP_ID="", FEISHU_APP_SECRET="")
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        ws_handler.start_feishu_ws(app)

        assert ws_handler._ws_client is None

    def test_start_feishu_ws_skips_when_client_exists(self, app_with_feishu_config, monkeypatch):
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)
        ws_handler._ws_client = object()

        ws_handler.start_feishu_ws(app_with_feishu_config)

        assert ws_handler._ws_client is not None

    def test_start_feishu_ws_skips_when_lark_not_installed(self, app_with_feishu_config):
        with patch("builtins.__import__", side_effect=ImportError("missing lark")):
            ws_handler.start_feishu_ws(app_with_feishu_config)

        assert ws_handler._ws_client is None

    def test_start_feishu_ws_registers_callbacks_and_starts_client(self, app_with_feishu_config, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        with patch.object(ws_handler, "_process_agent_message") as mock_process:
            ws_handler.start_feishu_ws(app_with_feishu_config)
            message_cb = callbacks["message"]
            card_cb = callbacks["card"]

            message_cb(SimpleNamespace(raw_event={"message": {"chat_type": "group"}}))
            mock_process.assert_not_called()

            event_dict = {
                "message": {"chat_type": "p2p", "chat_id": "chat-1"},
                "sender": {"sender_id": {"open_id": "ou_1"}},
            }
            message_cb(SimpleNamespace(raw_event=event_dict))
            mock_process.assert_called_once_with(app_with_feishu_config, event_dict)

            invalid = card_cb(SimpleNamespace(event=None))
            assert invalid["toast"]["type"] == "info"

            missing_feedback = card_cb(SimpleNamespace(event=SimpleNamespace(action=SimpleNamespace(value={}))))
            assert missing_feedback["toast"]["type"] == "info"

            positive = card_cb(SimpleNamespace(event=SimpleNamespace(action=SimpleNamespace(value={"feedback": "positive"}))))
            assert positive["toast"]["type"] == "success"

            negative = card_cb(SimpleNamespace(event=SimpleNamespace(action=SimpleNamespace(value={"feedback": "negative"}))))
            assert "持续改进" in negative["toast"]["content"]

        assert ws_handler._ws_client is not None
        assert ws_handler._ws_client.started is True

    def test_start_feishu_ws_logs_message_callback_exception(self, app_with_feishu_config, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        with patch.object(ws_handler, "_process_agent_message", side_effect=RuntimeError("boom")):
            with patch.object(ws_handler, "logger") as mock_logger:
                ws_handler.start_feishu_ws(app_with_feishu_config)
                callbacks["message"](
                    SimpleNamespace(
                        raw_event={
                            "message": {"chat_type": "p2p", "chat_id": "chat-1"},
                            "sender": {"sender_id": {"open_id": "ou_1"}},
                        }
                    )
                )

        mock_logger.error.assert_called()

    def test_start_feishu_ws_card_callback_persists_feedback_and_logs_warning(self, app_with_feishu_config, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)
        session = MagicMock()
        log_entry = MagicMock()
        session.query.return_value.filter_by.return_value.first.return_value = log_entry

        with patch("app.extensions.db", SimpleNamespace(session=session)):
            ws_handler.start_feishu_ws(app_with_feishu_config)
            response = callbacks["card"](
                SimpleNamespace(event=SimpleNamespace(action=SimpleNamespace(value={"feedback": "positive", "query_id": "12"})))
            )

        assert response["toast"]["type"] == "success"
        log_entry.set_feedback.assert_called_once_with("positive")
        session.commit.assert_called_once()

        ws_handler._ws_client = None
        callbacks = _install_fake_lark(monkeypatch)
        session = MagicMock()
        session.query.return_value.filter_by.return_value.first.return_value = log_entry
        session.commit.side_effect = RuntimeError("commit boom")
        with patch("app.extensions.db", SimpleNamespace(session=session)):
            with patch.object(ws_handler, "logger") as mock_logger:
                ws_handler.start_feishu_ws(app_with_feishu_config)
                callbacks["card"](
                    SimpleNamespace(event=SimpleNamespace(action=SimpleNamespace(value={"feedback": "negative", "query_id": "13"})))
                )

        mock_logger.warning.assert_called()

    def test_start_feishu_ws_logs_client_start_failure(self, app_with_feishu_config, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        _ = callbacks
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        class FailingClient:
            def __init__(self, *args, **kwargs):
                self.args = args
                self.kwargs = kwargs

            def start(self):
                raise RuntimeError("start failed")

        sys.modules["lark_oapi"].ws = SimpleNamespace(Client=FailingClient)

        with patch.object(ws_handler, "logger") as mock_logger:
            ws_handler.start_feishu_ws(app_with_feishu_config)

        mock_logger.error.assert_called()

    def test_start_feishu_ws_card_callback_returns_error_toast_on_unexpected_exception(self, app_with_feishu_config, monkeypatch):
        callbacks = _install_fake_lark(monkeypatch)
        monkeypatch.setattr(ws_handler.threading, "Thread", InlineThread)

        with patch.object(ws_handler, "logger") as mock_logger:
            ws_handler.start_feishu_ws(app_with_feishu_config)
            result = callbacks["card"](
                SimpleNamespace(event=SimpleNamespace(action=SimpleNamespace(value="broken")))
            )

        assert result["toast"]["type"] == "error"
        mock_logger.error.assert_called()
