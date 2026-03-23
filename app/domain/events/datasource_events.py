"""
数据源领域事件
"""
from dataclasses import dataclass
from typing import Dict, Any
from .base import DomainEvent


@dataclass
class DatasourceCreated(DomainEvent):
    """数据源已创建事件"""
    datasource_id: int = 0
    name: str = ""
    source_type: str = ""
    created_by: str = ""


@dataclass
class DatasourceUpdated(DomainEvent):
    """数据源已更新事件"""
    datasource_id: int = 0
    changes: Dict[str, Any] = None
    updated_by: str = ""
    
    def __post_init__(self):
        if self.changes is None:
            self.changes = {}


@dataclass
class DatasourceDeleted(DomainEvent):
    """数据源已删除事件"""
    datasource_id: int = 0
    name: str = ""
    deleted_by: str = ""


@dataclass
class DatasourceConnectionTested(DomainEvent):
    """数据源连接已测试事件"""
    datasource_id: int = 0
    success: bool = False
    error_message: str = ""
