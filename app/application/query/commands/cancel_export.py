"""
取消异步数据导出命令
"""
from dataclasses import dataclass


@dataclass
class CancelExportCommand:
    """取消异步数据导出命令"""
    export_id: int
    user_id: str
