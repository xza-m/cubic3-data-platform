"""
应用定义仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
from app.domain.entities.app_definition import AppDefinition


class IAppDefinitionRepository(ABC):
    """应用定义仓储接口"""

    @abstractmethod
    def save(self, definition: AppDefinition) -> AppDefinition:
        """保存应用定义（创建或更新）"""
        pass

    @abstractmethod
    def find_by_id(self, id: int) -> Optional[AppDefinition]:
        """根据ID查找应用定义"""
        pass

    @abstractmethod
    def find_by_code(self, code: str) -> Optional[AppDefinition]:
        """根据编码查找应用定义"""
        pass

    @abstractmethod
    def find_all(self, page: int, page_size: int) -> Tuple[List[AppDefinition], int]:
        """分页查找所有应用定义"""
        pass

    @abstractmethod
    def delete(self, definition: AppDefinition) -> None:
        """删除应用定义"""
        pass

    @abstractmethod
    def commit(self) -> None:
        """提交事务"""
        pass
