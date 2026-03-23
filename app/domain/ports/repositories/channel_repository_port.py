"""
渠道仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
from app.domain.entities.config.channel import Channel


class IChannelRepository(ABC):
    """渠道仓储接口"""

    @abstractmethod
    def save(self, channel: Channel) -> Channel:
        """保存渠道（创建或更新）"""
        pass

    @abstractmethod
    def find_by_id(self, id: int) -> Optional[Channel]:
        """根据ID查找渠道"""
        pass

    @abstractmethod
    def find_all(self, page: int, page_size: int) -> Tuple[List[Channel], int]:
        """分页查找所有渠道"""
        pass

    @abstractmethod
    def delete(self, channel: Channel) -> None:
        """删除渠道"""
        pass

    @abstractmethod
    def commit(self) -> None:
        """提交事务"""
        pass
