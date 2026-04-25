"""
提交异步数据导出命令
"""
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class SubmitExportCommand:
    """提交异步数据导出命令"""
    source_id: int
    sql_query: str
    user_id: str
    visual_spec: Optional[Dict[str, Any]] = None
