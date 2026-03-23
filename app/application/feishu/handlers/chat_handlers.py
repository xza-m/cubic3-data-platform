"""
飞书群组管理 Handlers
"""
from typing import List, Dict, Any, Optional

from app.infrastructure.repositories.feishu_chat_repository import FeishuChatRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def _chat_to_dict(chat) -> Dict[str, Any]:
    """将 FeishuChatRef 转换为字典"""
    return {
        "chat_id": chat.chat_id,
        "chat_name": chat.chat_name,
        "active": chat.active,
        "last_seen_at": chat.last_seen_at.isoformat() if chat.last_seen_at else None,
        "added_via": chat.added_via,
    }


class ListChatsHandler:
    """查询群组列表"""
    
    def __init__(self, feishu_chat_repository: FeishuChatRepository):
        self.feishu_chat_repository = feishu_chat_repository
    
    def handle(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """
        查询群组列表
        
        Args:
            active_only: 是否只查询活跃群组
        
        Returns:
            群组列表
        """
        if active_only:
            chats = self.feishu_chat_repository.find_active()
        else:
            chats = self.feishu_chat_repository.find_all()
        return [_chat_to_dict(c) for c in chats]


class UpdateChatHandler:
    """更新群组状态"""
    
    def __init__(self, feishu_chat_repository: FeishuChatRepository):
        self.feishu_chat_repository = feishu_chat_repository
    
    def handle(self, chat_id: str, active: bool) -> Optional[Dict[str, Any]]:
        """
        更新群组活跃状态
        
        Args:
            chat_id: 飞书群 ID
            active: 新的活跃状态
        
        Returns:
            更新后的群组字典，或 None（不存在）
        """
        chat = self.feishu_chat_repository.update_active(chat_id, active)
        if not chat:
            return None
        return _chat_to_dict(chat)
