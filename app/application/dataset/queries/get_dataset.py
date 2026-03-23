"""
获取数据集详情
"""
from dataclasses import dataclass


@dataclass
class GetDatasetQuery:
    """获取数据集详情"""
    dataset_id: int
    include_fields: bool = False
