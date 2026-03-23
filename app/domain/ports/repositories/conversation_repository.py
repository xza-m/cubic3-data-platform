"""
对话仓储接口
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.entities.conversation import Conversation, Message


class IConversationRepository(ABC):
    """对话仓储接口"""
    
    @abstractmethod
    def create(self, conversation: Conversation) -> Conversation:
        """创建对话"""
        pass
    
    @abstractmethod
    def find_by_id(self, conversation_id: int) -> Optional[Conversation]:
        """根据ID查找对话"""
        pass
    
    @abstractmethod
    def list_by_user(self, user_id: str, offset: int = 0, limit: int = 20) -> List[Conversation]:
        """列出用户的对话"""
        pass
    
    @abstractmethod
    def update(self, conversation: Conversation) -> Conversation:
        """更新对话"""
        pass
    
    @abstractmethod
    def delete(self, conversation_id: int) -> None:
        """删除对话"""
        pass


class IMessageRepository(ABC):
    """消息仓储接口"""
    
    @abstractmethod
    def create(self, message: Message) -> Message:
        """创建消息"""
        pass
    
    @abstractmethod
    def find_by_conversation(self, conversation_id: int, offset: int = 0, limit: int = 100) -> List[Message]:
        """获取对话的消息列表"""
        pass
    
    @abstractmethod
    def find_by_id(self, message_id: int) -> Optional[Message]:
        """根据ID查找消息"""
        pass
