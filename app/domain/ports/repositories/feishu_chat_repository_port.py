"""
飞书群组仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List


class IFeishuChatRepository(ABC):
    """飞书群组仓储接口"""
    
    @abstractmethod
    def upsert(self, chat_id: str, name: Optional[str], added_via: str):
        """创建或更新群组记录"""
        pass
    
    @abstractmethod
    def deactivate(self, chat_id: str) -> bool:
        """停用群组"""
        pass
    
    @abstractmethod
    def find_active(self) -> List:
        """查询所有活跃群组"""
        pass
    
    @abstractmethod
    def find_all(self) -> List:
        """查询所有群组"""
        pass
    
    @abstractmethod
    def find_by_chat_id(self, chat_id: str) -> Optional[object]:
        """根据 chat_id 查找"""
        pass
    
    @abstractmethod
    def update_active(self, chat_id: str, active: bool) -> Optional[object]:
        """更新群组活跃状态"""
        pass
    
    @abstractmethod
    def commit(self) -> None:
        """提交当前事务"""
        pass
