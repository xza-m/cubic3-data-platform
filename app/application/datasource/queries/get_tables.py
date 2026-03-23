"""
获取数据库的表列表
"""
from dataclasses import dataclass


@dataclass
class GetTablesQuery:
    """获取表列表"""
    datasource_id: int
    database: str
    force_refresh: bool = False
