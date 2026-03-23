"""
创建数据源命令
"""
from dataclasses import dataclass
from typing import Dict, Any, Optional


@dataclass
class CreateDatasourceCommand:
    """创建数据源命令"""
    name: str
    source_type: str
    connection_config: Dict[str, Any]
    description: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    created_by: str = 'system'
