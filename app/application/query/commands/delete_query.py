"""
删除查询命令
"""
from dataclasses import dataclass


@dataclass
class DeleteQueryCommand:
    """删除查询命令"""
    query_id: int
