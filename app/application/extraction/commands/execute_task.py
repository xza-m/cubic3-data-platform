"""
执行任务命令
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ExecuteTaskCommand:
    """
    执行提取任务命令
    
    用途：封装执行任务的输入参数
    """
    
    task_id: int
    triggered_by: str
    user_id: str  # 用于权限校验
    trace_id: Optional[str] = None  # 用于日志追踪
