from unittest.mock import MagicMock

import requests

from app.infrastructure.notification.feishu_webhook import FeishuWebhookNotifier


def test_is_configured_and_send_helpers_delegate(monkeypatch) -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")
    post_calls = []
    monkeypatch.setattr(notifier, "_post", lambda payload: post_calls.append(payload) or True)

    assert notifier.is_configured is True
    assert notifier.send_text("hello") is True
    assert notifier.send_card({"schema": "2.0"}) is True
    assert post_calls == [
        {"msg_type": "text", "content": {"text": "hello"}},
        {"msg_type": "interactive", "card": {"schema": "2.0"}},
    ]


def test_send_schema_drift_report_returns_true_when_no_drifts() -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")

    assert notifier.send_schema_drift_report(10, 10, [], []) is True


def test_send_schema_drift_report_builds_summary_card(monkeypatch) -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")
    sent_cards = []
    monkeypatch.setattr(notifier, "send_card", lambda card: sent_cards.append(card) or True)

    result = notifier.send_schema_drift_report(
        total_cubes=12,
        checked_cubes=10,
        skipped_cubes=["cube_skip"],
        drifts=[
            {"cube": "order_cube", "table": "dws_order", "kind": "missing_in_physical", "column": "ds", "detail": "partition"},
            {"cube": "order_cube", "table": "dws_order", "kind": "type_mismatch", "column": "amount", "detail": "double -> bigint"},
            {"cube": "user_cube", "table": "dim_user", "kind": "missing_in_cube", "column": "city"},
        ],
    )

    assert result is True
    card = sent_cards[0]
    assert card["header"]["template"] == "orange"
    assert "发现 **3** 项偏移" in card["elements"][0]["text"]["content"]
    assert "**order_cube**" in card["elements"][2]["text"]["content"]


def test_post_returns_false_when_webhook_not_configured() -> None:
    notifier = FeishuWebhookNotifier("")

    assert notifier._post({"hello": "world"}) is False


def test_post_success_on_code_zero(monkeypatch) -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")
    monkeypatch.setattr(
        "app.infrastructure.notification.feishu_webhook.requests.post",
        lambda *args, **kwargs: MagicMock(json=lambda: {"code": 0}),
    )

    assert notifier._post({"hello": "world"}) is True


def test_post_success_on_status_code_zero(monkeypatch) -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")
    monkeypatch.setattr(
        "app.infrastructure.notification.feishu_webhook.requests.post",
        lambda *args, **kwargs: MagicMock(json=lambda: {"StatusCode": 0}),
    )

    assert notifier._post({"hello": "world"}) is True


def test_post_returns_false_on_nonzero_business_code(monkeypatch) -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")
    monkeypatch.setattr(
        "app.infrastructure.notification.feishu_webhook.requests.post",
        lambda *args, **kwargs: MagicMock(json=lambda: {"code": 999, "msg": "fail"}),
    )

    assert notifier._post({"hello": "world"}) is False


def test_post_returns_false_on_request_exception(monkeypatch) -> None:
    notifier = FeishuWebhookNotifier("https://example.com/hook")

    def _raise(*args, **kwargs):
        raise requests.RequestException("network down")

    monkeypatch.setattr("app.infrastructure.notification.feishu_webhook.requests.post", _raise)

    assert notifier._post({"hello": "world"}) is False
