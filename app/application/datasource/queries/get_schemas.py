"""
获取数据库的Schema列表
"""
from dataclasses import dataclass


@dataclass
class GetSchemasQuery:
    """获取Schema列表"""
    datasource_id: int
    database: str
