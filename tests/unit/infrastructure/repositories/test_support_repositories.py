"""
通用仓储覆盖测试
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.orm import Session

from app.infrastructure.repositories.app_definition_repository import AppDefinitionRepository
from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository
from app.infrastructure.repositories.channel_repository import ChannelRepository
from app.infrastructure.repositories.subscription_repository import SubscriptionRepository
from app.infrastructure.repositories.query_template_repository import QueryTemplateRepository
from app.infrastructure.repositories.conversation_repository import ConversationRepository, MessageRepository
from app.infrastructure.repositories.sql_query_repository import SQLQueryRepository


def _session():
    return MagicMock(spec=Session)


def test_app_definition_repository_covers_query_paths():
    session = _session()
    repo = AppDefinitionRepository(session)
    query = MagicMock()
    query.filter_by.return_value = query
    query.order_by.return_value = query
    query.all.return_value = ["app"]
    query.first.return_value = "one"
    session.query.return_value = query

    assert repo.find_all(category="report", enabled_only=True) == ["app"]
    assert repo.find_all(category=None, enabled_only=False) == ["app"]
    assert repo.find_by_code("report_push") == "one"
    assert repo.find_by_id(1) == "one"

    entity = MagicMock()
    assert repo.save(entity) is entity
    repo.delete(entity)
    repo.commit()
    repo.get_categories_with_count()

    session.add.assert_called_with(entity)
    session.delete.assert_called_with(entity)
    assert session.commit.call_count >= 3


def test_app_instance_repository_covers_filters_and_schedule_queries():
    session = _session()
    repo = AppInstanceRepository(session)
    query = MagicMock()
    query.filter_by.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 2
    query.all.return_value = ["instance"]
    query.first.return_value = "target"
    session.query.return_value = query

    entity = MagicMock()
    assert repo.save(entity) is entity
    assert repo.find_by_id(1) == "target"
    items, total = repo.find_all(app_code="report", owner="alice", enabled=True, page=2, page_size=5)
    assert items == ["instance"]
    assert total == 2
    assert repo.find_enabled_event_instances() == ["instance"]
    assert repo.find_enabled_cron_instances() == ["instance"]
    repo.delete(entity)
    repo.commit()

    session.add.assert_called_with(entity)
    session.delete.assert_called_with(entity)
    query.offset.assert_called_with(5)
    query.limit.assert_called_with(5)


def test_channel_repository_covers_crud_and_filters():
    session = _session()
    repo = ChannelRepository(session)
    query = MagicMock()
    query.get.return_value = "channel"
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 1
    query.all.return_value = ["channel"]
    session.query.return_value = query

    entity = MagicMock()
    assert repo.save(entity) is entity
    assert repo.find_by_id(1) == "channel"
    items, total = repo.find_all(channel_type="feishu", enabled=False, page=3, page_size=10)
    assert items == ["channel"]
    assert total == 1
    repo.delete(entity)
    repo.commit()

    query.offset.assert_called_with(20)
    query.limit.assert_called_with(10)


def test_subscription_repository_covers_relation_queries_and_filters():
    session = _session()
    repo = SubscriptionRepository(session)
    query = MagicMock()
    query.options.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 4
    query.all.return_value = ["subscription"]
    query.first.return_value = "detail"
    query.get.return_value = "simple"
    session.query.return_value = query

    entity = MagicMock()
    assert repo.save(entity) is entity
    assert repo.find_by_id(1) == "simple"
    assert repo.find_by_id_with_relations(1) == "detail"
    items, total = repo.find_all(app_instance_id=2, channel_id=3, enabled=True, page=2, page_size=5)
    assert items == ["subscription"]
    assert total == 4
    assert repo.find_by_app_instance(2, enabled_only=True) == ["subscription"]
    assert repo.find_by_app_instance(2, enabled_only=False) == ["subscription"]
    assert repo.find_matching_subscriptions("task.completed") == ["subscription"]
    repo.delete(entity)
    repo.commit()

    query.offset.assert_called_with(5)
    query.limit.assert_called_with(5)


def test_query_template_repository_covers_search_pagination_and_delete():
    session = _session()
    repo = QueryTemplateRepository(session)
    query = MagicMock()
    query.filter_by.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.count.return_value = 3
    query.all.return_value = ["template"]
    query.first.return_value = "template-1"
    session.query.return_value = query

    entity = MagicMock()
    assert repo.save(entity) is entity
    assert repo.find_by_id(1) == "template-1"
    result = repo.find_all(page=2, per_page=10, category="ops", search="report")
    assert result == {"items": ["template"], "total": 3}
    repo.delete(entity)
    repo.commit()
    query.offset.assert_called_with(10)
    query.limit.assert_called_with(10)


def test_conversation_and_message_repositories_cover_crud_paths(monkeypatch):
    session = _session()
    conversation_repo = ConversationRepository(session)
    message_repo = MessageRepository(session)
    logger = MagicMock()
    monkeypatch.setattr("app.infrastructure.repositories.conversation_repository.logger", logger)

    conversation = MagicMock(id=1, user_id="alice")
    message = MagicMock(id=2, conversation_id=1, role="user")

    assert conversation_repo.create(conversation) is conversation
    assert conversation_repo.update(conversation) is conversation

    convo_query = MagicMock()
    convo_query.filter.return_value = convo_query
    convo_query.order_by.return_value = convo_query
    convo_query.offset.return_value = convo_query
    convo_query.limit.return_value = convo_query
    convo_query.first.return_value = conversation
    convo_query.all.return_value = [conversation]

    msg_query = MagicMock()
    msg_query.filter.return_value = msg_query
    msg_query.order_by.return_value = msg_query
    msg_query.offset.return_value = msg_query
    msg_query.limit.return_value = msg_query
    msg_query.first.return_value = message
    msg_query.all.return_value = [message]
    session.query.side_effect = [convo_query, convo_query, convo_query, msg_query, msg_query]

    assert conversation_repo.find_by_id(1) is conversation
    assert conversation_repo.list_by_user("alice", offset=5, limit=10) == [conversation]

    conversation_repo.delete(1)
    conversation.soft_delete.assert_called_once()

    assert message_repo.create(message) is message
    assert message_repo.find_by_conversation(1, offset=2, limit=3) == [message]
    assert message_repo.find_by_id(2) is message

    assert session.flush.call_count >= 3
    logger.info.assert_called()


def test_conversation_delete_noop_when_not_found(monkeypatch):
    session = _session()
    repo = ConversationRepository(session)
    logger = MagicMock()
    monkeypatch.setattr("app.infrastructure.repositories.conversation_repository.logger", logger)
    repo.find_by_id = MagicMock(return_value=None)

    repo.delete(404)

    session.flush.assert_not_called()
    logger.info.assert_not_called()


def test_sql_query_repository_covers_save_find_and_commit():
    session = _session()
    repo = SQLQueryRepository(session)
    query = MagicMock()
    query.filter_by.return_value = query
    query.first.return_value = "sql-query"
    session.query.return_value = query

    entity = MagicMock()
    assert repo.save(entity) is entity
    assert repo.find_by_id(1) == "sql-query"
    repo.commit()
    assert session.commit.call_count == 2
