"""
创建文件夹命令
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class CreateFolderCommand:
    """创建文件夹命令"""
    folder_name: str
    created_by: str
    parent_id: Optional[int] = None
