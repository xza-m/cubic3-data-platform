"""
查询文件夹列表Query
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ListFoldersQuery:
    """查询文件夹列表Query"""
    created_by: Optional[str] = None
