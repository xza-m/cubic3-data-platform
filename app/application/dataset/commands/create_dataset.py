"""
创建数据集命令
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional


@dataclass
class CreateDatasetCommand:
    """创建数据集命令"""
    dataset_code: str
    dataset_name: str
    source_id: int
    physical_table: str
    fields: List[Dict[str, Any]]  # 字段列表
    description: Optional[str] = None
    owner: Optional[str] = None
    created_by: str = 'system'
    dataset_type: str = 'physical'  # physical, virtual, file
    sql_query: Optional[str] = None  # 虚拟数据集的 SQL
    file_metadata: Optional[Dict[str, Any]] = None  # 文件数据集的元数据