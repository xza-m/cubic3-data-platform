"""
查询列表Query
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListQueriesQuery:
    """查询列表Query"""
    page: int = 1
    page_size: int = 20
    folder_id: Optional[int] = None
    is_favorite: Optional[bool] = None
    search: Optional[str] = None  # 搜索查询名或SQL内容
    created_by: Optional[str] = None
