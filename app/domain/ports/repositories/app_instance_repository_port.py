"""
应用实例仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
from app.domain.entities.app_instance import AppInstance


class IAppInstanceRepository(ABC):
    """应用实例仓储接口"""

    @abstractmethod
    def save(self, instance: AppInstance) -> AppInstance:
        """保存应用实例（创建或更新）"""
        pass

    @abstractmethod
    def find_by_id(self, id: int) -> Optional[AppInstance]:
        """根据ID查找应用实例"""
        pass

    @abstractmethod
    def find_all(
        self,
        app_code: Optional[str] = None,
        owner: Optional[str] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[AppInstance], int]:
        """按条件分页查找应用实例"""
        pass

    @abstractmethod
    def find_enabled_cron_instances(self) -> List[AppInstance]:
        """查找所有启用了定时任务的实例"""
        pass

    @abstractmethod
    def delete(self, instance: AppInstance) -> None:
        """删除应用实例"""
        pass

    @abstractmethod
    def commit(self) -> None:
        """提交事务"""
        pass
