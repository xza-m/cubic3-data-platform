"""
任务列表查询
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListTasksQuery:
    """
    任务列表查询
    
    用途：封装列表查询的筛选参数
    """
    
    dataset_id: Optional[int] = None
    task_type: Optional[str] = None
    is_active: Optional[bool] = None
    created_by: Optional[str] = None
    page: int = 1
    page_size: int = 20
    
    def to_filters(self) -> dict:
        """转换为过滤条件字典"""
        filters = {}
        
        if self.dataset_id is not None:
            filters['dataset_id'] = self.dataset_id
        
        if self.task_type is not None:
            filters['task_type'] = self.task_type
        
        if self.is_active is not None:
            filters['is_active'] = self.is_active
        
        if self.created_by is not None:
            filters['created_by'] = self.created_by
        
        return filters
