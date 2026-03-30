import types
from unittest.mock import MagicMock

import pytest

import app.interfaces.channels.feishu_channel as feishu_channel_module
from app.domain.agent.entities import AgentResponse, AgentStep
from app.interfaces.channels.feishu_channel import FeishuChannel


def _build_response(
    *,
    text: str = "查询完成",
    sql: str | None = None,
    data: list[list[object]] | None = None,
    columns: list[str] | None = None,
    error: str | None = None,
) -> AgentResponse:
    return AgentResponse(
        text=text,
        sql=sql,
        data=data,
        columns=columns,
        error=error,
    )


def test_to_agent_request_parses_json_payload() -> None:
    channel = FeishuChannel(MagicMock())

    request = channel.to_agent_request(
        {
            "message": {
                "content": '{"text":"  查询订单数  "}',
                "chat_id": "oc_123",
                "message_id": "om_456",
            },
            "sender": {
                "sender_id": {
                    "open_id": "ou_789",
                }
            },
        }
    )

    assert request.message == "查询订单数"
    assert request.context.channel == "feishu"
    assert request.context.user_id == "ou_789"
    assert request.context.open_id == "ou_789"
    assert request.context.chat_id == "oc_123"
    assert request.context.message_id == "om_456"


def test_to_agent_request_falls_back_to_plain_text() -> None:
    channel = FeishuChannel(MagicMock())

    request = channel.to_agent_request(
        {
            "message": {
                "content": "纯文本问题",
            },
            "sender": {},
        }
    )

    assert request.message == "纯文本问题"
    assert request.context.user_id is None


def test_deliver_response_returns_early_without_chat_id() -> None:
    client = MagicMock()
    channel = FeishuChannel(client)

    result = channel.deliver_response(_build_response())

    assert result is None
    client.send_interactive_card.assert_not_called()
    client.update_message.assert_not_called()


def test_deliver_response_updates_existing_card_when_small_result() -> None:
    client = MagicMock()
    channel = FeishuChannel(client)

    channel.deliver_response(
        _build_response(
            data=[[1, "Alice"]],
            columns=["id", "name"],
            sql="select 1",
        ),
        chat_id="chat_1",
        card_message_id="msg_1",
        query_id=7,
    )

    client.update_message.assert_called_once()
    client.send_interactive_card.assert_not_called()


def test_deliver_response_falls_back_to_new_card_when_update_fails() -> None:
    client = MagicMock()
    client.update_message.side_effect = RuntimeError("update failed")
    channel = FeishuChannel(client)

    channel.deliver_response(
        _build_response(data=[[1]], columns=["id"]),
        chat_id="chat_1",
        card_message_id="msg_1",
    )

    client.update_message.assert_called_once()
    client.send_interactive_card.assert_called_once()


def test_deliver_response_uses_csv_branch_for_large_result(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    channel = FeishuChannel(client)
    deliver_csv = MagicMock()
    monkeypatch.setattr(channel, "_deliver_csv", deliver_csv)

    channel.deliver_response(
        _build_response(
            data=[[idx] for idx in range(feishu_channel_module.CSV_ROW_THRESHOLD + 1)],
            columns=["id"],
        ),
        chat_id="chat_1",
    )

    deliver_csv.assert_called_once()
    client.send_interactive_card.assert_not_called()


def test_deliver_csv_success_sends_file_and_summary_card() -> None:
    client = MagicMock()
    client.upload_file_bytes.return_value = "file_key"
    channel = FeishuChannel(client)

    response = _build_response(
        text="导出完成",
        sql="select * from t",
        data=[[1], [2]],
        columns=["id"],
    )

    channel._deliver_csv(response, "chat_1", "msg_1", 9)

    client.upload_file_bytes.assert_called_once()
    client.send_file_message.assert_called_once_with("chat_1", "file_key", "query_result.csv")
    client.update_message.assert_called_once()


def test_deliver_csv_upload_failure_falls_back_to_result_card(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    client.upload_file_bytes.side_effect = RuntimeError("upload failed")
    channel = FeishuChannel(client)
    send_or_update = MagicMock()
    monkeypatch.setattr(channel, "_send_or_update_card", send_or_update)

    response = _build_response(
        text="导出完成",
        data=[[1]],
        columns=["id"],
    )

    channel._deliver_csv(response, "chat_1", None, 3)

    client.send_file_message.assert_not_called()
    send_or_update.assert_called_once()


def test_send_thinking_card_returns_message_id() -> None:
    client = MagicMock()
    client.send_interactive_card.return_value = "msg_123"
    channel = FeishuChannel(client)

    message_id = channel.send_thinking_card("chat_1")

    assert message_id == "msg_123"
    sent_card = client.send_interactive_card.call_args.args[1]
    assert sent_card["header"]["title"]["content"] == "🔍 CUBIC3"


def test_update_progress_card_swallow_client_error() -> None:
    client = MagicMock()
    client.update_message.side_effect = RuntimeError("boom")
    channel = FeishuChannel(client)

    channel.update_progress_card(
        "msg_1",
        AgentStep(tool_name="sql", status="running", summary="正在生成 SQL"),
    )

    client.update_message.assert_called_once()


def test_build_result_card_includes_table_sql_error_and_feedback() -> None:
    channel = FeishuChannel(MagicMock())

    card = channel._build_result_card(
        _build_response(
            text="结果如下",
            sql="select * from demo",
            data=[[1, "Alice"], [2, None]],
            columns=["id", "name"],
            error="存在告警",
        ),
        query_id=42,
    )

    elements = card["body"]["elements"]
    assert card["header"]["template"] == "red"
    assert any("结果如下" in element.get("content", "") for element in elements if element["tag"] == "markdown")
    assert any("select * from demo" in panel["elements"][0]["content"] for panel in elements if panel["tag"] == "collapsible_panel")
    assert any("⚠️ 存在告警" in element.get("content", "") for element in elements if element["tag"] == "markdown")
    assert elements[-1]["tag"] == "column_set"


def test_build_markdown_table_handles_empty_and_truncation() -> None:
    assert FeishuChannel._build_markdown_table([], []) == ""

    table = FeishuChannel._build_markdown_table(
        ["id", "name"],
        [[1, "Alice"], [2, "Bob"]],
        max_rows=1,
    )

    assert "| id | name |" in table
    assert "*（共 2 行，仅展示前 1 行）*" in table


def test_generate_csv_truncates_when_size_limit_exceeded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(feishu_channel_module, "MAX_CSV_BYTES", 20)

    csv_bytes, actual_rows, truncated = FeishuChannel._generate_csv(
        ["id", "name"],
        [[1, "Alice"], [2, "Bob"]],
    )

    assert truncated is True
    assert actual_rows == 2
    assert csv_bytes.startswith(b"\xef\xbb\xbf")


def test_build_csv_summary_card_includes_truncate_notice_and_feedback() -> None:
    channel = FeishuChannel(MagicMock())

    card = channel._build_csv_summary_card(
        _build_response(text="已导出", sql="select * from t"),
        total_rows=50,
        actual_rows=10,
        truncated=True,
        query_id=99,
    )

    elements = card["body"]["elements"]
    assert any("已导出 CSV 文件" in element.get("content", "") for element in elements if element["tag"] == "markdown")
    assert any("已截取前 **10** 行" in element.get("content", "") for element in elements if element["tag"] == "markdown")
    assert elements[-1]["tag"] == "column_set"


def test_build_feedback_buttons_contains_query_id() -> None:
    group = FeishuChannel._build_feedback_buttons(5)

    values = [column["elements"][0]["value"] for column in group["columns"]]
    assert values == [
        {"feedback": "positive", "query_id": "5"},
        {"feedback": "negative", "query_id": "5"},
    ]
