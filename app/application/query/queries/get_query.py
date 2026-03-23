"""
获取查询详情Query
"""
from dataclasses import dataclass


@dataclass
class GetQueryQuery:
    """获取查询详情Query"""
    query_id: int
