"""
预览表数据查询对象
"""
from dataclasses import dataclass


@dataclass
class PreviewTableDataQuery:
    """预览表数据查询"""
    datasource_id: int
    database: str
    table: str
    limit: int = 10
