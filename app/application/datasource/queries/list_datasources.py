"""
查询数据源列表
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListDatasourcesQuery:
    """查询数据源列表"""
    source_type: Optional[str] = None
    is_active: Optional[bool] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 20
