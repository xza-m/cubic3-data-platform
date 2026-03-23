"""
对话仓储实现
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.domain.entities.conversation import Conversation, Message
from app.domain.ports.repositories.conversation_repository import IConversationRepository, IMessageRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ConversationRepository(IConversationRepository):
    """对话仓储实现"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def create(self, conversation: Conversation) -> Conversation:
        """创建对话"""
        self.session.add(conversation)
        self.session.flush()
        logger.info(f"Created conversation", conversation_id=conversation.id, user_id=conversation.user_id)
        return conversation
    
    def find_by_id(self, conversation_id: int) -> Optional[Conversation]:
        """根据ID查找对话"""
        return self.session.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.is_deleted == False
        ).first()
    
    def list_by_user(self, user_id: str, offset: int = 0, limit: int = 20) -> List[Conversation]:
        """列出用户的对话"""
        return self.session.query(Conversation).filter(
            Conversation.user_id == user_id,
            Conversation.is_deleted == False
        ).order_by(Conversation.updated_at.desc()).offset(offset).limit(limit).all()
    
    def update(self, conversation: Conversation) -> Conversation:
        """更新对话"""
        self.session.flush()
        logger.info(f"Updated conversation", conversation_id=conversation.id)
        return conversation
    
    def delete(self, conversation_id: int) -> None:
        """删除对话（软删除）"""
        conversation = self.find_by_id(conversation_id)
        if conversation:
            conversation.soft_delete()
            self.session.flush()
            logger.info(f"Deleted conversation", conversation_id=conversation_id)


class MessageRepository(IMessageRepository):
    """消息仓储实现"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def create(self, message: Message) -> Message:
        """创建消息"""
        self.session.add(message)
        self.session.flush()
        logger.info(f"Created message", message_id=message.id, conversation_id=message.conversation_id, role=message.role)
        return message
    
    def find_by_conversation(self, conversation_id: int, offset: int = 0, limit: int = 100) -> List[Message]:
        """获取对话的消息列表"""
        return self.session.query(Message).filter(
            Message.conversation_id == conversation_id
        ).order_by(Message.created_at.asc()).offset(offset).limit(limit).all()
    
    def find_by_id(self, message_id: int) -> Optional[Message]:
        """根据ID查找消息"""
        return self.session.query(Message).filter(Message.id == message_id).first()
