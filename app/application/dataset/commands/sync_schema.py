"""
同步数据集Schema命令
"""
from dataclasses import dataclass


@dataclass
class SyncSchemaCommand:
    """同步Schema命令"""
    dataset_id: int
