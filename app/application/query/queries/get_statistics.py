"""
获取统计数据Query
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class GetStatisticsQuery:
    """获取统计数据Query"""
    user_id: Optional[str] = None
