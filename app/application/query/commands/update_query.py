"""
更新查询命令
"""
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class UpdateQueryCommand:
    """更新查询命令"""
    query_id: int
    query_name: Optional[str] = None
    sql_query: Optional[str] = None
    description: Optional[str] = None
    folder_id: Optional[int] = None
    tags: Optional[List[str]] = None
    source_id: Optional[int] = None
