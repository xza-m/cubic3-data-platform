"""
执行历史列表查询
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListRunsQuery:
    """
    执行历史列表查询
    
    用途：封装执行历史查询的筛选参数
    """
    
    task_id: Optional[int] = None
    status: Optional[str] = None
    triggered_by: Optional[str] = None
    page: int = 1
    page_size: int = 20
    
    def to_filters(self) -> dict:
        """转换为过滤条件字典"""
        filters = {}
        
        if self.task_id is not None:
            filters['task_id'] = self.task_id
        
        if self.status is not None:
            filters['status'] = self.status
        
        if self.triggered_by is not None:
            filters['triggered_by'] = self.triggered_by
        
        return filters
