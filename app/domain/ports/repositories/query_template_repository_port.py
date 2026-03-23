"""
查询模板仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any


class IQueryTemplateRepository(ABC):
    """查询模板仓储接口"""
    
    @abstractmethod
    def save(self, template) -> object:
        """保存模板"""
        pass
    
    @abstractmethod
    def find_by_id(self, template_id: int) -> Optional[object]:
        """根据 ID 查找模板"""
        pass
    
    @abstractmethod
    def find_all(self, page: int, per_page: int, category: Optional[str], search: Optional[str]) -> Dict[str, Any]:
        """分页查询模板列表"""
        pass
    
    @abstractmethod
    def delete(self, template) -> None:
        """删除模板"""
        pass
    
    @abstractmethod
    def commit(self) -> None:
        """提交当前事务"""
        pass
