"""
数据集领域事件
"""
from dataclasses import dataclass
from typing import Dict, Any
from .base import DomainEvent


@dataclass
class DatasetCreated(DomainEvent):
    """数据集已创建事件"""
    dataset_id: int = 0
    dataset_code: str = ""
    dataset_name: str = ""
    source_id: int = 0
    created_by: str = ""


@dataclass
class DatasetUpdated(DomainEvent):
    """数据集已更新事件"""
    dataset_id: int = 0
    changes: Dict[str, Any] = None
    updated_by: str = ""
    
    def __post_init__(self):
        if self.changes is None:
            self.changes = {}


@dataclass
class DatasetDeleted(DomainEvent):
    """数据集已删除事件"""
    dataset_id: int = 0
    dataset_code: str = ""
    deleted_by: str = ""


@dataclass
class DatasetSchemaSynced(DomainEvent):
    """数据集Schema已同步事件"""
    dataset_id: int = 0
    field_count: int = 0
