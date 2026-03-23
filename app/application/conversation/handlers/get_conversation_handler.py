"""
获取对话处理器
"""
from typing import Dict, Any
from app.application.conversation.queries.get_conversation import GetConversationQuery
from app.domain.ports.repositories.conversation_repository import IConversationRepository, IMessageRepository
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class GetConversationHandler:
    """获取对话处理器"""
    
    def __init__(
        self,
        conversation_repository: IConversationRepository,
        message_repository: IMessageRepository
    ):
        self.conversation_repository = conversation_repository
        self.message_repository = message_repository
    
    def handle(self, query: GetConversationQuery) -> Dict[str, Any]:
        """
        处理获取对话查询
        
        Args:
            query: 获取对话查询
        
        Returns:
            对话详情（包含消息列表）
        """
        conversation = self.conversation_repository.find_by_id(query.conversation_id)
        if not conversation:
            raise ApplicationException(f"对话不存在: {query.conversation_id}")
        
        if conversation.user_id != query.user_id:
            raise ApplicationException("无权访问此对话")
        
        # 获取消息列表
        messages = self.message_repository.find_by_conversation(query.conversation_id)
        
        result = conversation.to_dict(include_messages=False)
        result['messages'] = [msg.to_dict() for msg in messages]
        
        return result
