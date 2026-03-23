"""
订阅仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
from app.domain.entities.config.subscription import Subscription


class ISubscriptionRepository(ABC):
    """订阅仓储接口"""

    @abstractmethod
    def save(self, subscription: Subscription) -> Subscription:
        """保存订阅（创建或更新）"""
        pass

    @abstractmethod
    def find_by_id(self, id: int) -> Optional[Subscription]:
        """根据ID查找订阅"""
        pass

    @abstractmethod
    def find_all(self, page: int, page_size: int) -> Tuple[List[Subscription], int]:
        """分页查找所有订阅"""
        pass

    @abstractmethod
    def delete(self, subscription: Subscription) -> None:
        """删除订阅"""
        pass

    @abstractmethod
    def commit(self) -> None:
        """提交事务"""
        pass
