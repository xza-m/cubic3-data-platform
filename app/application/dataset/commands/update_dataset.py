"""
更新数据集命令
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class UpdateDatasetCommand:
    """更新数据集命令"""
    dataset_id: int
    dataset_name: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
