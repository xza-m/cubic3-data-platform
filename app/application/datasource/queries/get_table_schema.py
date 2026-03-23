"""
获取表的Schema信息（字段列表）
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class GetTableSchemaQuery:
    """获取表Schema"""
    datasource_id: int
    database: str
    table: str
    schema: Optional[str] = None
