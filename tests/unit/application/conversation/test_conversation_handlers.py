from unittest.mock import MagicMock

import pytest

from app.application.conversation.commands.create_conversation import CreateConversationCommand
from app.application.conversation.handlers.create_conversation_handler import CreateConversationHandler
from app.application.conversation.handlers.get_conversation_handler import GetConversationHandler
from app.application.conversation.handlers.list_conversations_handler import ListConversationsHandler
from app.application.conversation.queries.get_conversation import GetConversationQuery
from app.application.conversation.queries.list_conversations import ListConversationsQuery
from app.shared.exceptions import ApplicationException


class TestCreateConversationHandler:
    def test_handle_creates_conversation_with_default_title(self):
        conversation_repo = MagicMock()
        dataset_repo = MagicMock()
        dataset_repo.find_by_id.return_value = MagicMock(dataset_name="销售数据集", is_ready=lambda: True)
        conversation = MagicMock(id=1, title="与 销售数据集 的对话")
        conversation_repo.create.return_value = conversation
        handler = CreateConversationHandler(conversation_repo, dataset_repo)
        command = CreateConversationCommand(dataset_id=10, user_id="u1", description="desc")

        result = handler.handle(command)

        assert result is conversation
        created = conversation_repo.create.call_args.args[0]
        assert created.title == "与 销售数据集 的对话"
        assert created.description == "desc"
        assert created.dataset_id == 10
        assert created.user_id == "u1"
        # 仓储绑定容器 scoped_session，handler 必须在同一 session 上提交事务
        conversation_repo.commit.assert_called_once()

    def test_handle_uses_custom_title(self):
        conversation_repo = MagicMock()
        dataset_repo = MagicMock()
        dataset_repo.find_by_id.return_value = MagicMock(dataset_name="销售数据集", is_ready=lambda: True)
        conversation_repo.create.return_value = MagicMock(id=1)
        handler = CreateConversationHandler(conversation_repo, dataset_repo)
        command = CreateConversationCommand(dataset_id=10, user_id="u1", title="我的标题")

        handler.handle(command)

        created = conversation_repo.create.call_args.args[0]
        assert created.title == "我的标题"

    def test_handle_raises_when_dataset_missing(self):
        handler = CreateConversationHandler(MagicMock(), MagicMock(find_by_id=MagicMock(return_value=None)))

        with pytest.raises(ApplicationException, match="数据集不存在"):
            handler.handle(CreateConversationCommand(dataset_id=10, user_id="u1"))

    def test_handle_raises_when_dataset_not_ready(self):
        dataset_repo = MagicMock()
        dataset_repo.find_by_id.return_value = MagicMock(dataset_name="销售数据集", is_ready=lambda: False)
        handler = CreateConversationHandler(MagicMock(), dataset_repo)

        with pytest.raises(ApplicationException, match="数据集未就绪"):
            handler.handle(CreateConversationCommand(dataset_id=10, user_id="u1"))

    def test_handle_creates_global_conversation_without_dataset(self):
        # 全局问数：dataset_id=None 时不校验数据集，默认标题「全局问数」，dataset_id 透传 None。
        conversation_repo = MagicMock()
        dataset_repo = MagicMock()
        conversation_repo.create.return_value = MagicMock(id=1)
        handler = CreateConversationHandler(conversation_repo, dataset_repo)

        handler.handle(CreateConversationCommand(dataset_id=None, user_id="u1"))

        dataset_repo.find_by_id.assert_not_called()
        created = conversation_repo.create.call_args.args[0]
        assert created.title == "全局问数"
        assert created.dataset_id is None


class TestGetConversationHandler:
    def test_handle_raises_when_conversation_missing(self):
        handler = GetConversationHandler(MagicMock(find_by_id=MagicMock(return_value=None)), MagicMock())

        with pytest.raises(ApplicationException, match="对话不存在"):
            handler.handle(GetConversationQuery(conversation_id=1, user_id="u1"))

    def test_handle_raises_when_user_is_unauthorized(self):
        conversation = MagicMock(user_id="u2")
        handler = GetConversationHandler(MagicMock(find_by_id=MagicMock(return_value=conversation)), MagicMock())

        with pytest.raises(ApplicationException, match="无权访问"):
            handler.handle(GetConversationQuery(conversation_id=1, user_id="u1"))

    def test_handle_returns_conversation_with_messages(self):
        conversation = MagicMock(user_id="u1")
        conversation.to_dict.return_value = {"id": 1, "title": "聊天"}
        message_one = MagicMock()
        message_one.to_dict.return_value = {"id": 11, "content": "hello"}
        message_two = MagicMock()
        message_two.to_dict.return_value = {"id": 12, "content": "world"}
        conversation_repo = MagicMock(find_by_id=MagicMock(return_value=conversation))
        message_repo = MagicMock(find_by_conversation=MagicMock(return_value=[message_one, message_two]))
        handler = GetConversationHandler(conversation_repo, message_repo)

        result = handler.handle(GetConversationQuery(conversation_id=1, user_id="u1"))

        assert result["messages"] == [{"id": 11, "content": "hello"}, {"id": 12, "content": "world"}]
        conversation.to_dict.assert_called_once_with(include_messages=False)


class TestListConversationsHandler:
    def test_handle_returns_items_and_pagination(self):
        conversation_one = MagicMock()
        conversation_one.to_dict.return_value = {"id": 1}
        conversation_two = MagicMock()
        conversation_two.to_dict.return_value = {"id": 2}
        repo = MagicMock(list_by_user=MagicMock(return_value=[conversation_one, conversation_two]))
        handler = ListConversationsHandler(repo)

        result = handler.handle(ListConversationsQuery(user_id="u1", offset=10, limit=5))

        repo.list_by_user.assert_called_once_with(user_id="u1", offset=10, limit=5)
        assert result == {
            "items": [{"id": 1}, {"id": 2}],
            "offset": 10,
            "limit": 5,
            "total": 2,
        }
