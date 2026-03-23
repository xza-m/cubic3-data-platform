"""
删除数据源命令
"""
from dataclasses import dataclass


@dataclass
class DeleteDatasourceCommand:
    """删除数据源命令"""
    datasource_id: int
