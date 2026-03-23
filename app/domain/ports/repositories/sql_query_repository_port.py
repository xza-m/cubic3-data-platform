"""
SQL 查询任务仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional


class ISQLQueryRepository(ABC):
    """SQL 查询任务仓储接口"""
    
    @abstractmethod
    def save(self, query):
        """保存查询记录"""
        pass
    
    @abstractmethod
    def find_by_id(self, query_id: int) -> Optional[object]:
        """根据 ID 查找查询记录"""
        pass
    
    @abstractmethod
    def commit(self) -> None:
        """提交当前事务"""
        pass
