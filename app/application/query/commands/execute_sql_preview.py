"""
SQL 预览执行命令
用于 SQL Lab 的临时查询预览（不记录历史）
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ExecuteSQLPreviewCommand:
    """执行 SQL 预览命令"""
    source_id: int
    sql_query: str
    limit: int = 100
    
    def __post_init__(self):
        """验证命令参数"""
        if not self.source_id:
            raise ValueError("数据源ID不能为空")
        
        if not self.sql_query or not self.sql_query.strip():
            raise ValueError("SQL查询不能为空")
        
        if self.limit <= 0:
            self.limit = 100
        elif self.limit > 1000:
            self.limit = 1000  # 最大1000行
