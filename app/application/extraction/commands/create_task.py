"""
创建任务命令
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional


@dataclass
class CreateTaskCommand:
    """
    创建提取任务命令
    
    用途：封装创建任务的所有输入参数
    """
    
    task_name: str
    dataset_id: int
    select_fields: List[str]
    filter_conditions: Dict[str, Any]
    row_limit: int = 500000
    task_type: str = 'manual'
    schedule_config: Optional[Dict[str, Any]] = None
    subscription_config: Optional[Dict[str, Any]] = None
    created_by: str = 'system'
