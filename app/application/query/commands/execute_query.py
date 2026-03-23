"""
执行查询命令
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ExecuteQueryCommand:
    """执行查询命令"""
    source_id: int
    sql_query: str
    query_id: Optional[int] = None  # 如果是保存的查询，传递 query_id
    limit: Optional[int] = 1000  # 默认限制1000行
    executed_by: str = 'admin'
