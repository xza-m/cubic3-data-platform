"""
更新任务命令
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional


@dataclass
class UpdateTaskCommand:
    """
    更新提取任务命令
    
    用途：封装更新任务的输入参数
    """
    
    task_id: int
    task_name: Optional[str] = None
    select_fields: Optional[List[str]] = None
    filter_conditions: Optional[Dict[str, Any]] = None
    row_limit: Optional[int] = None
    schedule_config: Optional[Dict[str, Any]] = None
    subscription_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    updated_by: str = 'system'
