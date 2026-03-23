"""MaxCompute SchemaInspector — 通过 DataSourceAdapter 获取物理 Schema"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.domain.semantic.ports.schema_inspector import ISchemaInspector
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class MaxComputeSchemaInspector(ISchemaInspector):

    def __init__(self, adapter: Any, database: str):
        self._adapter = adapter
        self._database = database

    def get_table_columns(self, table_name: str) -> List[Dict[str, str]]:
        try:
            schema = self._adapter.get_table_schema(self._database, table_name)
            columns = schema.get("columns", [])
            return [
                {"name": c.get("name", ""), "type": c.get("type", "STRING")}
                for c in columns
            ]
        except Exception as e:
            logger.error("get_table_columns failed", table=table_name, error=str(e))
            return []

    def fetch_dict_enums(self, dict_type: str) -> Optional[Dict[str, str]]:
        sql = (
            f"SELECT meta_dict_key, meta_dict_name "
            f"FROM dim_pub_meta_dict_df "
            f"WHERE ds = MAX_PT('dim_pub_meta_dict_df') "
            f"AND meta_dict_type = '{dict_type}'"
        )
        try:
            result = self._adapter.execute_query(sql, limit=1000)
            data = result.get("data") or result.get("rows") or []
            return {str(row[0]): str(row[1]) for row in data} if data else None
        except Exception as e:
            logger.error("fetch_dict_enums failed", dict_type=dict_type, error=str(e))
            return None
