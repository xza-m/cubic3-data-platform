"""
获取数据源的数据库列表
"""
from dataclasses import dataclass


@dataclass
class GetDatabasesQuery:
    """获取数据库列表"""
    datasource_id: int
