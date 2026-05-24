"""数据资产快照 SchemaInspector。

该适配器复用语义中心现有 `ISchemaInspector` 端口，让
`SchemaSyncService` 可以读取数据资产底座里的表字段快照，而不是再写一套
Schema 漂移比较逻辑。
"""
from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any, Dict, List, Optional

from app.domain.semantic.ports.schema_inspector import ISchemaInspector

SnapshotLookup = Mapping[str, Any] | Callable[[str], Any]


class AssetSnapshotSchemaInspector(ISchemaInspector):
    """从数据资产底座快照读取物理表 Schema。"""

    def __init__(
        self,
        snapshots: SnapshotLookup,
        enum_provider: Optional[Callable[[str], Optional[Dict[str, str]]]] = None,
        fallback_inspector: Optional[ISchemaInspector] = None,
    ):
        self._lookup = snapshots
        self._enum_provider = enum_provider
        self._fallback_inspector = fallback_inspector
        if isinstance(snapshots, Mapping):
            self._snapshots = {str(key).lower(): value for key, value in snapshots.items()}
        else:
            self._snapshots = None

    @classmethod
    def from_repository(
        cls,
        repository: Any,
        enum_provider: Optional[Callable[[str], Optional[Dict[str, str]]]] = None,
        fallback_inspector: Optional[ISchemaInspector] = None,
    ) -> "AssetSnapshotSchemaInspector":
        """通过数据资产仓储读取最新 schema 快照。"""

        return cls(
            lambda table_name: _lookup_repository_snapshot(repository, table_name),
            enum_provider=enum_provider,
            fallback_inspector=fallback_inspector,
        )

    def get_table_columns(self, table_name: str) -> List[Dict[str, str]]:
        snapshot = self._resolve_snapshot(table_name)
        if snapshot is None:
            if self._fallback_inspector is not None:
                return self._fallback_inspector.get_table_columns(table_name)
            return []
        return self._normalize_columns(self._extract_columns(snapshot))

    def fetch_dict_enums(self, dict_type: str) -> Optional[Dict[str, str]]:
        if self._enum_provider is None:
            if self._fallback_inspector is not None:
                return self._fallback_inspector.fetch_dict_enums(dict_type)
            return None
        return self._enum_provider(dict_type)

    def _resolve_snapshot(self, table_name: str) -> Any:
        if self._snapshots is not None:
            return self._snapshots.get(str(table_name).lower())
        return self._lookup(table_name)

    @staticmethod
    def _extract_columns(snapshot: Any) -> List[Dict[str, Any]]:
        if isinstance(snapshot, list):
            return [item for item in snapshot if isinstance(item, dict)]
        if not isinstance(snapshot, dict):
            return []

        if isinstance(snapshot.get("columns"), list):
            return [item for item in snapshot["columns"] if isinstance(item, dict)]
        if isinstance(snapshot.get("fields"), list):
            return [item for item in snapshot["fields"] if isinstance(item, dict)]

        schema_snapshot = snapshot.get("schema_snapshot")
        if isinstance(schema_snapshot, dict):
            nested = schema_snapshot.get("columns") or schema_snapshot.get("fields")
            if isinstance(nested, list):
                return [item for item in nested if isinstance(item, dict)]

        return []

    @staticmethod
    def _normalize_columns(columns: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        normalized: List[Dict[str, str]] = []
        for column in columns:
            name = column.get("name") or column.get("physical_name") or column.get("field_name")
            if not name:
                continue
            data_type = (
                column.get("type")
                or column.get("data_type")
                or column.get("field_type")
                or "STRING"
            )
            normalized.append({"name": str(name), "type": str(data_type).upper()})
        return normalized


def _lookup_repository_snapshot(repository: Any, table_name: str) -> Optional[Dict[str, Any]]:
    table = _lookup_repository_table(repository, table_name)
    if table is None:
        return None
    table_id = _value(table, "id")
    if not table_id or not hasattr(repository, "latest_snapshot"):
        return None
    snapshot = repository.latest_snapshot(str(table_id), snapshot_type="schema")
    if snapshot is None:
        return None
    payload = _value(snapshot, "payload")
    return payload if isinstance(payload, dict) else None


def _lookup_repository_table(repository: Any, table_name: str) -> Any:
    if hasattr(repository, "get_table_by_qualified_name"):
        table = repository.get_table_by_qualified_name(table_name)
        if table is not None:
            return table
    if not hasattr(repository, "list_tables"):
        return None
    keyword = _last_name_part(table_name)
    page = repository.list_tables(keyword=keyword, page=1, page_size=50)
    for table in page.get("items", []) if isinstance(page, dict) else []:
        if _table_matches(table, table_name):
            return table
    return None


def _table_matches(table: Any, table_name: str) -> bool:
    expected = _normalize_table_name(table_name)
    candidates = {
        _normalize_table_name(_value(table, "name")),
        _normalize_table_name(
            ".".join(
                part
                for part in [
                    _value(table, "schema") or _value(table, "source_schema"),
                    _value(table, "name"),
                ]
                if part
            )
        ),
        _normalize_table_name(
            ".".join(
                part
                for part in [
                    _value(table, "database"),
                    _value(table, "schema") or _value(table, "source_schema"),
                    _value(table, "name"),
                ]
                if part
            )
        ),
    }
    return expected in candidates


def _value(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    value = getattr(obj, key, None)
    return None if callable(value) else value


def _last_name_part(table_name: str) -> str:
    return str(table_name or "").split(".")[-1].strip()


def _normalize_table_name(table_name: Any) -> str:
    return ".".join(part for part in str(table_name or "").lower().split(".") if part)
