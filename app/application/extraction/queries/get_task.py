"""
获取任务详情查询
"""
from dataclasses import dataclass


@dataclass
class GetTaskQuery:
    """
    获取任务详情查询
    
    用途：封装单个任务查询参数
    """
    
    task_id: int
    include_stats: bool = False  # 是否包含统计信息
