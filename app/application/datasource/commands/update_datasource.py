"""
更新数据源命令
"""
from dataclasses import dataclass
from typing import Dict, Any, Optional


@dataclass
class UpdateDatasourceCommand:
    """更新数据源命令"""
    datasource_id: int
    name: Optional[str] = None
    description: Optional[str] = None
    connection_config: Optional[Dict[str, Any]] = None
    extra_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
