"""
提取任务领域事件
"""
from dataclasses import dataclass
from typing import Dict, Any
from .base import DomainEvent


@dataclass
class TaskCreated(DomainEvent):
    """提取任务已创建事件"""
    task_id: int = 0
    task_name: str = ""
    dataset_id: int = 0
    created_by: str = ""


@dataclass
class TaskExecuted(DomainEvent):
    """提取任务已执行事件"""
    task_id: int = 0
    run_id: int = 0
    executor_id: str = ""


@dataclass
class TaskExecutionCompleted(DomainEvent):
    """提取任务执行完成事件"""
    task_id: int = 0
    run_id: int = 0
    success: bool = False
    extracted_rows: int = 0
    error_message: str = ""


@dataclass
class TaskExecutionFailed(DomainEvent):
    """提取任务执行失败事件"""
    task_id: int = 0
    run_id: int = 0
    error_message: str = ""
    retry_count: int = 0


@dataclass
class TaskDeleted(DomainEvent):
    """提取任务已删除事件"""
    task_id: int = 0
    task_name: str = ""
    deleted_by: str = ""


@dataclass
class TaskUpdated(DomainEvent):
    """提取任务已更新事件"""
    task_id: int = 0
    task_name: str = ""
    updated_by: str = ""
