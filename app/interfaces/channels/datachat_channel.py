"""
DataChat 信道适配器

处理 DataChat Web 界面的对话场景：
- 将 HTTP 请求转换为 AgentRequest（注入历史消息和数据集 schema）
- 将 AgentResponse 转换为持久化消息 + JSON 响应
"""
from __future__ import annotations

from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Any

from app.domain.agent.entities import AgentContext, AgentRequest, AgentResponse
from app.domain.entities.conversation import Message
from app.domain.ports.repositories.conversation_repository import (
    IConversationRepository,
    IMessageRepository,
)
from app.infrastructure.repositories.dataset_repository import DatasetRepository
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.interfaces.channels.base_channel import ChannelAdapter
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class DataChatChannel(ChannelAdapter):
    """DataChat Web 信道"""

    def __init__(
        self,
        conversation_repository: IConversationRepository,
        message_repository: IMessageRepository,
        dataset_repository: DatasetRepository,
        max_history_messages: int = 10,
    ):
        self._conv_repo = conversation_repository
        self._msg_repo = message_repository
        self._dataset_repo = dataset_repository
        self._max_history = max_history_messages

    def to_agent_request(
        self,
        raw_input: dict[str, Any],
    ) -> tuple[AgentRequest, dict[str, Any], Any]:
        """
        从 HTTP 请求构建 AgentRequest

        Args:
            raw_input: {
                "conversation_id": int,
                "user_id": str,
                "content": str,
            }

        Returns:
            (AgentRequest, schema_info, DataSourceAdapter) 三元组
        """
        conversation_id = raw_input["conversation_id"]
        user_id = raw_input["user_id"]
        content = raw_input["content"]

        conversation = self._conv_repo.find_by_id(conversation_id)
        if not conversation:
            raise ApplicationException(f"对话不存在: {conversation_id}")
        if conversation.user_id != user_id:
            raise ApplicationException("无权访问此对话")

        dataset = self._dataset_repo.find_by_id(conversation.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {conversation.dataset_id}")

        # 构建 schema
        fields = dataset.fields.all()
        schema_info = {
            "table_name": dataset.physical_table,
            "source_type": dataset.source.source_type if dataset.source else "unknown",
            "fields": [
                {
                    "physical_name": f.physical_name,
                    "data_type": f.data_type,
                    "description": f.comment or "",
                }
                for f in fields
            ],
        }

        # 创建数据源适配器
        adapter = AdapterFactory.create_adapter(
            dataset.source.source_type,
            dataset.source.connection_config,
        )

        # 注入历史消息
        history = self._load_history(conversation_id)

        request = AgentRequest(
            message=content,
            context=AgentContext(
                channel="datachat",
                user_id=user_id,
                dataset_id=conversation.dataset_id,
                conversation_id=conversation_id,
            ),
            history=history if history else None,
        )

        return request, schema_info, adapter

    def deliver_response(
        self,
        response: AgentResponse,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        持久化 AI 回复并返回 JSON

        kwargs:
            conversation_id: int
            user_message: Message (已保存的用户消息)
        """
        conversation_id = kwargs["conversation_id"]
        user_message = kwargs["user_message"]

        ai_content = response.text or "已为您生成查询并执行。"
        query_result = None
        if response.data and response.columns:
            # 适配器可能返回 [{'name','type'}] 结构化列定义，统一归一化为列名列表
            column_names = [
                col.get("name") if isinstance(col, dict) else col
                for col in response.columns
            ]
            query_result = {
                "columns": column_names,
                "data": [dict(zip(column_names, row)) for row in response.data],
                "row_count": len(response.data),
            }

        ai_message = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=ai_content,
            generated_sql=response.sql,
            query_result=query_result,
            visualization_config={},
            source="agent",
            created_at=utcnow(),
        )
        if response.error:
            ai_message.error = response.error

        ai_message = self._msg_repo.create(ai_message)

        conversation = self._conv_repo.find_by_id(conversation_id)
        if conversation:
            conversation.updated_at = utcnow()
            self._conv_repo.update(conversation)

        return {
            "user_message": user_message.to_dict(),
            "ai_message": ai_message.to_dict(),
        }

    def _load_history(self, conversation_id: int) -> list[dict[str, str]]:
        """加载最近 N 条历史消息，格式化为 LLM 可用的 messages 列表"""
        try:
            messages = self._msg_repo.find_by_conversation(
                conversation_id,
                limit=self._max_history * 2,
            )
        except Exception:
            messages = []

        history = []
        for msg in messages:
            if msg.role in ("user", "assistant"):
                history.append({
                    "role": msg.role,
                    "content": msg.content or "",
                })

        if len(history) > self._max_history:
            history = history[-self._max_history:]

        return history
