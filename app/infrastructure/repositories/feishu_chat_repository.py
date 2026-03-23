"""
飞书群组仓储实现
"""
from typing import Optional, List
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy.orm import Session

from app.domain.entities.feishu_chat_ref import FeishuChatRef
from app.domain.ports.repositories.feishu_chat_repository_port import IFeishuChatRepository


class FeishuChatRepository(IFeishuChatRepository):
    """飞书群组仓储"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def upsert(self, chat_id: str, name: Optional[str], added_via: str) -> FeishuChatRef:
        """
        创建或更新群组记录
        
        Args:
            chat_id: 飞书群 ID
            name: 群名称
            added_via: 添加方式
        
        Returns:
            群组记录
        """
        chat = self.session.query(FeishuChatRef).filter_by(chat_id=chat_id).first()
        if chat:
            chat.chat_name = name or chat.chat_name
            chat.active = True
            chat.added_via = added_via or chat.added_via
            chat.last_seen_at = utcnow()
        else:
            chat = FeishuChatRef(
                chat_id=chat_id,
                chat_name=name,
                added_via=added_via,
                active=True,
                last_seen_at=utcnow(),
            )
            self.session.add(chat)
        self.session.commit()
        return chat
    
    def deactivate(self, chat_id: str) -> bool:
        """
        停用群组
        
        Args:
            chat_id: 飞书群 ID
        
        Returns:
            是否成功（群是否存在）
        """
        chat = self.session.query(FeishuChatRef).filter_by(chat_id=chat_id).first()
        if not chat:
            return False
        chat.active = False
        chat.last_seen_at = utcnow()
        self.session.commit()
        return True
    
    def find_active(self) -> List[FeishuChatRef]:
        """查询所有活跃群组"""
        return (
            self.session.query(FeishuChatRef)
            .filter_by(active=True)
            .order_by(FeishuChatRef.updated_at.desc())
            .all()
        )
    
    def find_all(self) -> List[FeishuChatRef]:
        """查询所有群组"""
        return (
            self.session.query(FeishuChatRef)
            .order_by(FeishuChatRef.updated_at.desc())
            .all()
        )
    
    def find_by_chat_id(self, chat_id: str) -> Optional[FeishuChatRef]:
        """根据 chat_id 查找"""
        return self.session.query(FeishuChatRef).filter_by(chat_id=chat_id).first()
    
    def update_active(self, chat_id: str, active: bool) -> Optional[FeishuChatRef]:
        """
        更新群组活跃状态
        
        Args:
            chat_id: 飞书群 ID
            active: 新的活跃状态
        
        Returns:
            更新后的群组记录，或 None
        """
        chat = self.session.query(FeishuChatRef).filter_by(chat_id=chat_id).first()
        if not chat:
            return None
        chat.active = active
        chat.last_seen_at = utcnow()
        self.session.commit()
        return chat
    
    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
