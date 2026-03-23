"""
删除数据集命令
"""
from dataclasses import dataclass


@dataclass
class DeleteDatasetCommand:
    """删除数据集命令"""
    dataset_id: int
