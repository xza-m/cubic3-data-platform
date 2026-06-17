from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.domain.agent.entities import AgentResponse
from app.shared.exceptions import ApplicationException
from app.interfaces.channels.datachat_channel import DataChatChannel


def _build_dataset() -> SimpleNamespace:
    # DatasetField 实体的备注字段是 comment（无 description 属性）
    fields = [
        SimpleNamespace(physical_name="user_id", data_type="bigint", comment="用户 ID"),
        SimpleNamespace(physical_name="order_cnt", data_type="bigint", comment=None),
    ]
    return SimpleNamespace(
        id=7,
        physical_table="dws_orders",
        source=SimpleNamespace(
            source_type="postgresql",
            connection_config={"host": "localhost"},
        ),
        fields=SimpleNamespace(all=lambda: fields),
    )


def test_to_agent_request_builds_schema_history_and_adapter(monkeypatch: pytest.MonkeyPatch) -> None:
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    dataset_repo = MagicMock()
    adapter = object()

    conv_repo.find_by_id.return_value = SimpleNamespace(dataset_id=7, user_id="user_1")
    dataset_repo.find_by_id.return_value = _build_dataset()
    monkeypatch.setattr(
        "app.interfaces.channels.datachat_channel.AdapterFactory.create_adapter",
        lambda source_type, config: adapter,
    )

    channel = DataChatChannel(conv_repo, msg_repo, dataset_repo, max_history_messages=3)
    monkeypatch.setattr(channel, "_load_history", lambda conversation_id: [{"role": "user", "content": "历史消息"}])

    request, schema_info, resolved_adapter = channel.to_agent_request(
        {
            "conversation_id": 3,
            "user_id": "user_1",
            "content": "帮我统计订单数",
        }
    )

    assert request.message == "帮我统计订单数"
    assert request.context.channel == "datachat"
    assert request.context.dataset_id == 7
    assert request.context.conversation_id == 3
    assert request.history == [{"role": "user", "content": "历史消息"}]
    assert schema_info["table_name"] == "dws_orders"
    assert schema_info["source_type"] == "postgresql"
    assert schema_info["fields"][0]["description"] == "用户 ID"
    assert schema_info["fields"][1]["description"] == ""
    assert resolved_adapter is adapter


def test_to_agent_request_raises_when_conversation_missing() -> None:
    channel = DataChatChannel(MagicMock(find_by_id=lambda conversation_id: None), MagicMock(), MagicMock())

    with pytest.raises(ApplicationException, match="对话不存在"):
        channel.to_agent_request(
            {
                "conversation_id": 1,
                "user_id": "user_1",
                "content": "hello",
            }
        )


def test_to_agent_request_raises_when_user_is_unauthorized() -> None:
    conv_repo = MagicMock()
    conv_repo.find_by_id.return_value = SimpleNamespace(dataset_id=7, user_id="owner")
    channel = DataChatChannel(conv_repo, MagicMock(), MagicMock())

    with pytest.raises(ApplicationException, match="无权访问此对话"):
        channel.to_agent_request(
            {
                "conversation_id": 1,
                "user_id": "guest",
                "content": "hello",
            }
        )


def test_to_agent_request_raises_when_dataset_missing() -> None:
    conv_repo = MagicMock()
    dataset_repo = MagicMock()
    conv_repo.find_by_id.return_value = SimpleNamespace(dataset_id=7, user_id="owner")
    dataset_repo.find_by_id.return_value = None
    channel = DataChatChannel(conv_repo, MagicMock(), dataset_repo)

    with pytest.raises(ApplicationException, match="数据集不存在"):
        channel.to_agent_request(
            {
                "conversation_id": 1,
                "user_id": "owner",
                "content": "hello",
            }
        )


def test_deliver_response_persists_ai_message_and_updates_conversation() -> None:
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    dataset_repo = MagicMock()
    conversation = SimpleNamespace(updated_at=None)
    conv_repo.find_by_id.return_value = conversation
    msg_repo.create.side_effect = lambda message: message
    channel = DataChatChannel(conv_repo, msg_repo, dataset_repo)

    user_message = SimpleNamespace(to_dict=lambda: {"id": 10, "role": "user"})
    response = AgentResponse(
        text="分析完成",
        sql="select count(*) from orders",
        data=[[1, "Alice"]],
        columns=["id", "name"],
    )

    result = channel.deliver_response(
        response,
        conversation_id=5,
        user_message=user_message,
    )

    saved_message = msg_repo.create.call_args.args[0]
    assert saved_message.role == "assistant"
    assert saved_message.query_result == {
        "columns": ["id", "name"],
        "data": [{"id": 1, "name": "Alice"}],
        "row_count": 1,
    }
    assert result["user_message"] == {"id": 10, "role": "user"}
    assert result["ai_message"]["role"] == "assistant"
    conv_repo.update.assert_called_once_with(conversation)


def test_deliver_response_normalizes_structured_column_definitions() -> None:
    """适配器（如 MaxCompute）返回 [{'name','type'}] 列定义时必须归一化为列名。"""
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    conv_repo.find_by_id.return_value = SimpleNamespace(updated_at=None)
    msg_repo.create.side_effect = lambda message: message
    channel = DataChatChannel(conv_repo, msg_repo, MagicMock())

    response = AgentResponse(
        text="完成",
        sql="select ds, count(*) from t group by ds",
        data=[["20260611", 437961]],
        columns=[{"name": "ds", "type": "string"}, {"name": "total", "type": "bigint"}],
    )

    channel.deliver_response(
        response,
        conversation_id=5,
        user_message=SimpleNamespace(to_dict=lambda: {"id": 1}),
    )

    saved_message = msg_repo.create.call_args.args[0]
    assert saved_message.query_result == {
        "columns": ["ds", "total"],
        "data": [{"ds": "20260611", "total": 437961}],
        "row_count": 1,
    }


def test_deliver_response_records_error_and_skips_missing_conversation_update() -> None:
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    msg_repo.create.side_effect = lambda message: message
    conv_repo.find_by_id.return_value = None
    channel = DataChatChannel(conv_repo, msg_repo, MagicMock())

    result = channel.deliver_response(
        AgentResponse(text="", error="SQL 执行失败"),
        conversation_id=2,
        user_message=SimpleNamespace(to_dict=lambda: {"id": 1}),
    )

    saved_message = msg_repo.create.call_args.args[0]
    assert saved_message.content == "已为您生成查询并执行。"
    assert saved_message.error == "SQL 执行失败"
    assert result["ai_message"]["error"] == "SQL 执行失败"
    conv_repo.update.assert_not_called()


def test_load_history_filters_roles_and_limits_message_count() -> None:
    msg_repo = MagicMock()
    msg_repo.find_by_conversation.return_value = [
        SimpleNamespace(role="system", content="ignored"),
        SimpleNamespace(role="user", content="u1"),
        SimpleNamespace(role="assistant", content="a1"),
        SimpleNamespace(role="user", content="u2"),
        SimpleNamespace(role="assistant", content="a2"),
    ]
    channel = DataChatChannel(MagicMock(), msg_repo, MagicMock(), max_history_messages=3)

    history = channel._load_history(1)

    assert history == [
        {"role": "assistant", "content": "a1"},
        {"role": "user", "content": "u2"},
        {"role": "assistant", "content": "a2"},
    ]


def test_load_history_returns_empty_on_repository_error() -> None:
    msg_repo = MagicMock()
    msg_repo.find_by_conversation.side_effect = RuntimeError("db failure")
    channel = DataChatChannel(MagicMock(), msg_repo, MagicMock())

    assert channel._load_history(1) == []
