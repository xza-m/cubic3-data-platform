"""
删除任务命令
"""
from dataclasses import dataclass


@dataclass
class DeleteTaskCommand:
    """
    删除提取任务命令
    
    用途：封装删除任务的输入参数
    """
    
    task_id: int
    deleted_by: str = 'system'
