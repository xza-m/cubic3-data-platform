"""
创建查询命令
"""
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class CreateQueryCommand:
    """创建查询命令"""
    query_name: str
    source_id: int
    sql_query: str
    created_by: str
    query_code: Optional[str] = None  # 如果不提供则自动生成
    description: Optional[str] = None
    folder_id: Optional[int] = None
    tags: Optional[List[str]] = None
    is_favorite: bool = False
