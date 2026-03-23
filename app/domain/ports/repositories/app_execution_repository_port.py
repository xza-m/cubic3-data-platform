"""
应用执行记录仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
from app.domain.entities.app_execution import AppExecution


class IAppExecutionRepository(ABC):
    """应用执行记录仓储接口"""

    @abstractmethod
    def save(self, execution: AppExecution) -> AppExecution:
        """保存执行记录（创建或更新）"""
        pass

    @abstractmethod
    def find_by_id(self, id: int) -> Optional[AppExecution]:
        """根据ID查找执行记录"""
        pass

    @abstractmethod
    def find_by_instance(
        self, instance_id: int, page: int = 1, page_size: int = 20
    ) -> Tuple[List[AppExecution], int]:
        """按实例ID分页查找执行记录"""
        pass

    @abstractmethod
    def commit(self) -> None:
        """提交事务"""
        pass
