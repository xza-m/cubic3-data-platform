"""
查询历史列表Query
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListHistoriesQuery:
    """查询历史列表Query"""
    page: int = 1
    page_size: int = 20
    query_id: Optional[int] = None
    source_id: Optional[int] = None
    status: Optional[str] = None  # success/failed/timeout
    executed_by: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
