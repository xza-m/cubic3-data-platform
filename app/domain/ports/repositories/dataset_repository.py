"""
数据集仓储接口（端口）
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField


class IDatasetRepository(ABC):
    """
    数据集仓储接口（写操作）
    
    职责：
    1. 管理 Dataset 实体的持久化
    2. 管理 DatasetField 实体的持久化
    3. 提供事务支持
    
    注意：此接口仅用于写操作（Command），读操作（Query）直接使用 SQLAlchemy Core
    """
    
    @abstractmethod
    def save(self, dataset: Dataset) -> Dataset:
        """
        保存数据集（创建或更新）
        
        Args:
            dataset: 数据集实体
        
        Returns:
            保存后的数据集实体
        """
        pass
    
    @abstractmethod
    def find_by_id(self, dataset_id: int) -> Optional[Dataset]:
        """
        根据 ID 查找数据集
        
        Args:
            dataset_id: 数据集ID
        
        Returns:
            数据集实体或 None
        """
        pass
    
    @abstractmethod
    def find_by_code(self, dataset_code: str) -> Optional[Dataset]:
        """
        根据数据集编码查找数据集
        
        Args:
            dataset_code: 数据集编码
        
        Returns:
            数据集实体或 None
        """
        pass
    
    @abstractmethod
    def delete(self, dataset_id: int) -> bool:
        """
        删除数据集（软删除）
        
        Args:
            dataset_id: 数据集ID
        
        Returns:
            是否删除成功
        """
        pass
    
    @abstractmethod
    def save_field(self, field: DatasetField) -> DatasetField:
        """
        保存字段元数据
        
        Args:
            field: 字段实体
        
        Returns:
            保存后的字段实体
        """
        pass
    
    @abstractmethod
    def save_fields_batch(self, fields: List[DatasetField]) -> List[DatasetField]:
        """
        批量保存字段元数据（用于元数据同步）
        
        Args:
            fields: 字段实体列表
        
        Returns:
            保存后的字段实体列表
        """
        pass
    
    @abstractmethod
    def delete_fields(self, dataset_id: int, field_names: List[str]) -> int:
        """
        删除指定字段
        
        Args:
            dataset_id: 数据集ID
            field_names: 要删除的字段名列表
        
        Returns:
            删除的字段数量
        """
        pass
    
    @abstractmethod
    def commit(self):
        """提交事务"""
        pass
    
    @abstractmethod
    def rollback(self):
        """回滚事务"""
        pass
