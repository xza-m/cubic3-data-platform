from abc import ABC, abstractmethod
from typing import Dict, List, Optional


class ISchemaInspector(ABC):

    @abstractmethod
    def get_table_columns(self, table_name: str) -> List[Dict[str, str]]:
        """返回 [{"name": "col", "type": "STRING"}, ...]"""
        ...

    @abstractmethod
    def fetch_dict_enums(self, dict_type: str) -> Optional[Dict[str, str]]:
        """从元数据字典表加载枚举值"""
        ...
