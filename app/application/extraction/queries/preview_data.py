"""
预览数据查询
"""
from dataclasses import dataclass
from typing import List, Dict, Any


@dataclass
class PreviewDataQuery:
    """
    预览数据查询
    
    用途：执行小数据量查询，用于前端预览
    """
    
    dataset_id: int
    select_fields: List[str]
    filter_conditions: Dict[str, Any]
    limit: int = 10
    user_id: str = 'system'  # 用于权限校验
