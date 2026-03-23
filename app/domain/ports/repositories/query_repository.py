"""
查询仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from app.domain.entities.query import Query
from app.domain.entities.query_folder import QueryFolder
from app.domain.entities.query_history import QueryHistory


class QueryRepository(ABC):
    """查询仓储接口"""
    
    @abstractmethod
    def save(self, query: Query) -> Query:
        """保存查询"""
        pass
    
    @abstractmethod
    def find_by_id(self, query_id: int) -> Optional[Query]:
        """根据ID查找查询"""
        pass
    
    @abstractmethod
    def find_by_code(self, query_code: str) -> Optional[Query]:
        """根据code查找查询"""
        pass
    
    @abstractmethod
    def list_queries(self, page: int, page_size: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """查询列表"""
        pass
    
    @abstractmethod
    def delete(self, query_id: int) -> bool:
        """删除查询"""
        pass
    
    @abstractmethod
    def save_folder(self, folder: QueryFolder) -> QueryFolder:
        """保存文件夹"""
        pass
    
    @abstractmethod
    def list_folders(self, created_by: Optional[str] = None) -> List[QueryFolder]:
        """文件夹列表"""
        pass
    
    @abstractmethod
    def save_history(self, history: QueryHistory) -> QueryHistory:
        """保存历史记录"""
        pass
    
    @abstractmethod
    def list_histories(self, page: int, page_size: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """历史列表"""
        pass
    
    @abstractmethod
    def get_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """获取统计数据"""
        pass
