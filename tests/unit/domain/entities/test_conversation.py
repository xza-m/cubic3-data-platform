"""
Conversation / Message 实体单元测试
"""
from datetime import datetime
from unittest.mock import MagicMock

from app.domain.entities.conversation import Conversation, Message


class TestConversation:
    def test_record_clear_update_and_soft_delete_cover_state_changes(self):
        conversation = Conversation(
            id=1,
            title="原始标题",
            dataset_id=2,
            user_id="alice",
            description="desc",
            context={"step": 1},
        )

        conversation.record_event("created")
        assert conversation.clear_events() == ["created"]

        conversation.update_title("新标题")
        conversation.update_context({"step": 2})
        conversation.soft_delete()

        assert conversation.title == "新标题"
        assert conversation.context == {"step": 2}
        assert conversation.is_deleted is True
        assert conversation.updated_at is not None

    def test_get_recent_messages_and_to_dict_cover_dynamic_relationship_paths(self, app, db_session):
        from app.domain.entities import DataSource, Dataset

        datasource = DataSource(
            id=30,
            name="warehouse",
            source_type="mysql",
            connection_config={"host": "localhost"},
        )
        db_session.add(datasource)
        db_session.flush()

        dataset = Dataset(
            id=3,
            dataset_code="student_profile",
            dataset_name="学生数据集",
            dataset_type="physical",
            source_id=datasource.id,
            physical_table="student_profile",
            owner="bob",
            sync_status="synced",
        )
        db_session.add(dataset)
        db_session.flush()

        conversation = Conversation(
            id=10,
            title="对话",
            dataset_id=dataset.id,
            user_id="bob",
            description="memo",
            context={"topic": "coverage"},
        )
        conversation.created_at = datetime(2026, 1, 1, 12, 0, 0)
        conversation.updated_at = datetime(2026, 1, 1, 13, 0, 0)
        db_session.add(conversation)
        db_session.flush()

        message = Message(
            id=99,
            conversation_id=10,
            role="assistant",
            content="你好",
            generated_sql="select 1",
            query_result={"rows": 1},
            visualization_config={"type": "table"},
            error=None,
        )
        message.created_at = datetime(2026, 1, 1, 12, 30, 0)
        db_session.add(message)
        db_session.commit()

        recent = conversation.get_recent_messages(limit=5)
        payload = conversation.to_dict(include_messages=True)

        assert recent == [message]
        assert payload["dataset_name"] == "学生数据集"
        assert payload["message_count"] == 1
        assert payload["messages"][0]["content"] == "你好"
        assert "<Conversation 10: 对话>" == repr(conversation)


class TestMessage:
    def test_to_dict_and_repr_cover_optional_payloads(self):
        message = Message(
            id=7,
            conversation_id=8,
            role="user",
            content="帮我查一下",
            generated_sql=None,
            query_result=None,
            visualization_config=None,
            error="boom",
        )
        message.created_at = datetime(2026, 1, 2, 9, 0, 0)

        payload = message.to_dict()

        assert payload["conversation_id"] == 8
        assert payload["error"] == "boom"
        assert payload["created_at"] == "2026-01-02T09:00:00"
        assert repr(message) == "<Message 7: user>"
