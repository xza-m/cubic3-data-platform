"""
查询数据集列表
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListDatasetsQuery:
    """查询数据集列表"""
    source_id: Optional[int] = None
    owner: Optional[str] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 20
