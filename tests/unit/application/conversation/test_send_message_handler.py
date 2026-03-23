"""
Send Message Handler 单元测试

测试发送消息处理器：成功路径、错误路径、Agent 回退
"""
import pytest
from unittest.mock import MagicMock, patch

from app.application.conversation.handlers.send_message_handler import SendMessageHandler
from app.application.conversation.commands.send_message import SendMessageCommand
from app.domain.entities.conversation import Conversation, Message
from app.shared.exceptions import ApplicationException


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_repos():
    """Mock 仓储"""
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    dataset_repo = MagicMock()
    llm_service = MagicMock()
    return conv_repo, msg_repo, dataset_repo, llm_service


@pytest.fixture
def handler(mock_repos):
    """创建处理器"""
    conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
    return SendMessageHandler(
        conversation_repository=conv_repo,
        message_repository=msg_repo,
        dataset_repository=dataset_repo,
        llm_service=llm_service,
    )


@pytest.fixture
def command():
    """发送消息命令"""
    return SendMessageCommand(
        conversation_id=1,
        user_id="user_123",
        content="查询销售额",
    )


# ============================================================================
# 对话不存在 / 无权访问
# ============================================================================


class TestSendMessageHandlerErrors:
    def test_conversation_not_found_raises(self, handler, command, mock_repos):
        """对话不存在时抛出 ApplicationException"""
        conv_repo, msg_repo, _, _ = mock_repos
        conv_repo.find_by_id.return_value = None

        with pytest.raises(ApplicationException, match="对话不存在"):
            handler.handle(command)

        conv_repo.find_by_id.assert_called_once_with(1)

    def test_unauthorized_user_raises(self, handler, command, mock_repos):
        """用户无权访问对话时抛出"""
        conv_repo, msg_repo, _, _ = mock_repos
        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "other_user"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        with pytest.raises(ApplicationException, match="无权访问"):
            handler.handle(command)


# ============================================================================
# 传统 LLM 路径（Agent 不可用时回退）
# ============================================================================


class TestSendMessageHandlerLegacyLlm:
    def test_legacy_llm_success(self, handler, command, mock_repos):
        """传统 LLM 路径成功"""
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conversation.updated_at = None
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询"}
        ai_message = MagicMock()
        ai_message.to_dict.return_value = {"id": 2, "role": "assistant", "content": "已生成查询"}
        msg_repo.create.side_effect = [user_message, ai_message]

        dataset = MagicMock()
        dataset.physical_table = "sales"
        dataset.source = MagicMock()
        dataset.source.source_type = "mysql"
        dataset.source.connection_config = {}
        dataset.fields = MagicMock()
        dataset.fields.all.return_value = [
            MagicMock(physical_name="amount", data_type="decimal", description="金额"),
        ]
        dataset_repo.find_by_id.return_value = dataset

        llm_service.generate_sql.return_value = {
            "sql": "SELECT SUM(amount) FROM sales",
            "explanation": "已生成查询",
            "visualization_suggestion": {},
        }

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {"rows": [[1000]], "columns": ["total"]}

        with patch(
            "app.application.agent.agent_factory.get_data_agent_service",
            return_value=None,
        ):
            with patch(
                "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
                return_value=mock_adapter,
            ):
                result = handler.handle(command)

        assert "user_message" in result
        assert "ai_message" in result
        assert result["user_message"]["content"] == "查询"
        msg_repo.create.assert_called()
        llm_service.generate_sql.assert_called_once()

    def test_legacy_llm_dataset_not_found_raises(self, handler, command, mock_repos):
        """数据集不存在时抛出"""
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 999
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {}
        msg_repo.create.return_value = user_message

        dataset_repo.find_by_id.return_value = None

        with patch(
            "app.application.agent.agent_factory.get_data_agent_service",
            return_value=None,
        ):
            with pytest.raises(ApplicationException, match="数据集不存在"):
                handler.handle(command)

    def test_legacy_llm_error_creates_error_message(self, handler, command, mock_repos):
        """LLM 或查询异常时创建错误消息"""
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conversation.updated_at = None
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询"}
        error_ai_message = MagicMock()
        error_ai_message.to_dict.return_value = {
            "id": 2,
            "role": "assistant",
            "content": "抱歉，处理您的问题时遇到了错误。",
            "error": "LLM 服务不可用",
        }
        msg_repo.create.side_effect = [user_message, error_ai_message]

        dataset = MagicMock()
        dataset.physical_table = "sales"
        dataset.source = MagicMock()
        dataset.source.source_type = "mysql"
        dataset.source.connection_config = {}
        dataset.fields = MagicMock()
        dataset.fields.all.return_value = []
        dataset_repo.find_by_id.return_value = dataset

        llm_service.generate_sql.side_effect = Exception("LLM 服务不可用")

        with patch(
            "app.application.agent.agent_factory.get_data_agent_service",
            return_value=None,
        ):
            result = handler.handle(command)

        assert "ai_message" in result
        assert result["ai_message"].get("error") == "LLM 服务不可用"
        assert "抱歉" in result["ai_message"].get("content", "")
