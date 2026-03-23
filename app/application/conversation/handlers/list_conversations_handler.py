"""
列出对话处理器
"""
from typing import List, Dict, Any
from app.application.conversation.queries.list_conversations import ListConversationsQuery
from app.domain.ports.repositories.conversation_repository import IConversationRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ListConversationsHandler:
    """列出对话处理器"""
    
    def __init__(self, conversation_repository: IConversationRepository):
        self.conversation_repository = conversation_repository
    
    def handle(self, query: ListConversationsQuery) -> Dict[str, Any]:
        """
        处理列出对话查询
        
        Args:
            query: 列出对话查询
        
        Returns:
            对话列表和分页信息
        """
        conversations = self.conversation_repository.list_by_user(
            user_id=query.user_id,
            offset=query.offset,
            limit=query.limit
        )
        
        return {
            'items': [conv.to_dict(include_messages=False) for conv in conversations],
            'offset': query.offset,
            'limit': query.limit,
            'total': len(conversations)
        }
