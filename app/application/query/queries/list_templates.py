"""
查询模板列表Query
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListTemplatesQuery:
    """查询模板列表Query"""
    page: int = 1
    page_size: int = 20
    category: Optional[str] = None
    search: Optional[str] = None
