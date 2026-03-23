"""
预览数据集Schema
"""
from dataclasses import dataclass


@dataclass
class PreviewDatasetQuery:
    """预览数据集"""
    datasource_id: int
    database: str
    table: str
