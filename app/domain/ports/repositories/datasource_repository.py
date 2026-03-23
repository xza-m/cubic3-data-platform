"""
数据源仓储接口
"""
from abc import ABC, abstractmethod
from typing import Optional, List
from app.domain.entities.data_source import DataSource


class IDatasourceRepository(ABC):
    """
    数据源仓储接口
    
    定义数据源的持久化操作
    """
    
    @abstractmethod
    def save(self, datasource: DataSource) -> DataSource:
        """
        保存数据源（创建或更新）
        
        Args:
            datasource: 数据源实体
        
        Returns:
            保存后的数据源实体
        """
        pass
    
    @abstractmethod
    def find_by_id(self, datasource_id: int) -> Optional[DataSource]:
        """
        根据ID查找数据源
        
        Args:
            datasource_id: 数据源ID
        
        Returns:
            数据源实体或None
        """
        pass
    
    @abstractmethod
    def find_by_name(self, name: str) -> Optional[DataSource]:
        """
        根据名称查找数据源
        
        Args:
            name: 数据源名称
        
        Returns:
            数据源实体或None
        """
        pass
    
    @abstractmethod
    def find_all(self) -> List[DataSource]:
        """
        查找所有数据源
        
        Returns:
            数据源实体列表
        """
        pass
    
    @abstractmethod
    def delete(self, datasource: DataSource) -> None:
        """
        删除数据源
        
        Args:
            datasource: 数据源实体
        """
        pass
    
    @abstractmethod
    def exists_by_name(self, name: str, exclude_id: Optional[int] = None) -> bool:
        """
        检查名称是否已存在
        
        Args:
            name: 数据源名称
            exclude_id: 排除的ID（用于更新时检查）
        
        Returns:
            是否存在
        """
        pass
