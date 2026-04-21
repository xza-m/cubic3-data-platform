# app/application/datasources/schema_browser_service.py
"""
数据源 Schema 浏览服务（B-back-5）。

提供三层粒度浏览：
  - 列出所有数据库（catalog 层）
  - 列出指定数据库的所有表（table 层）
  - 获取指定表的字段列表（column 层）

缓存策略：进程内 dict + timestamp，TTL = 5 分钟。
  ∵ functools.lru_cache 无 TTL 支持，
  ∵ cachetools 为可选依赖，
  ∴ 此处手工实现轻量级 TTL cache，无需额外依赖。

若项目已引入 cachetools，可替换为 TTLCache：
  TODO(B-back-5-cache): 如并发量大，考虑换成 cachetools.TTLCache + RLock。
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Optional

from app.shared.exceptions import ApplicationException


_CACHE_TTL_SECONDS = 300  # 5 分钟


class _TTLCache:
    """极简 TTL 缓存（非线程安全，Web 并发可接受，误差在 TTL 精度内）。"""

    def __init__(self, ttl: float = _CACHE_TTL_SECONDS) -> None:
        self._ttl = ttl
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.monotonic() - ts > self._ttl:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (time.monotonic(), value)

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        keys = [k for k in self._store if k.startswith(prefix)]
        for k in keys:
            del self._store[k]


_global_cache = _TTLCache()


class SchemaBrowserService:
    """数据源 Schema 浏览服务，对 AdapterFactory 做缓存包装。"""

    def __init__(self, datasource_repository, cache: _TTLCache | None = None) -> None:
        """
        Args:
            datasource_repository: IDatasourceRepository — 查询数据源连接配置
            cache:                 可注入自定义缓存（测试用）；默认使用进程级全局缓存
        """
        self._repo = datasource_repository
        self._cache = cache if cache is not None else _global_cache

    # ── 公开接口 ─────────────────────────────────────────────────────────────

    def list_databases(self, datasource_id: int, *, refresh: bool = False) -> dict[str, Any]:
        """返回指定数据源的数据库列表。"""
        cache_key = f"ds:{datasource_id}:dbs"
        if not refresh:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        adapter = self._get_adapter(datasource_id)
        try:
            databases = adapter.list_databases()
        except Exception as exc:
            raise ApplicationException(f"获取数据库列表失败: {exc}") from exc

        result = {
            "datasource_id": datasource_id,
            "databases": databases,
            "fetched_at": _now_iso(),
        }
        self._cache.set(cache_key, result)
        return result

    def list_tables(
        self, datasource_id: int, database: str, *, refresh: bool = False
    ) -> dict[str, Any]:
        """返回指定数据库下的所有表。"""
        cache_key = f"ds:{datasource_id}:db:{database}:tables"
        if not refresh:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        adapter = self._get_adapter(datasource_id)
        try:
            raw_tables = adapter.list_tables(database)
        except Exception as exc:
            raise ApplicationException(f"获取表列表失败: {exc}") from exc

        # 统一字段名（不同 adapter 命名可能不同）
        tables = [
            {
                "table_name": t.get("table_name") or t.get("name", ""),
                "comment": t.get("comment") or t.get("description") or "",
                "row_count": t.get("row_count") or t.get("row_count_estimate"),
            }
            for t in (raw_tables if isinstance(raw_tables, list) else [])
        ]
        result = {
            "datasource_id": datasource_id,
            "database": database,
            "tables": tables,
            "fetched_at": _now_iso(),
        }
        self._cache.set(cache_key, result)
        return result

    def get_table_schema(
        self,
        datasource_id: int,
        database: str,
        table: str,
        *,
        refresh: bool = False,
    ) -> dict[str, Any]:
        """返回指定表的字段详情。"""
        cache_key = f"ds:{datasource_id}:db:{database}:tbl:{table}:schema"
        if not refresh:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        adapter = self._get_adapter(datasource_id)
        try:
            raw = adapter.get_table_schema(database, table)
        except Exception as exc:
            raise ApplicationException(f"获取表 Schema 失败: {exc}") from exc

        columns = [
            {
                "name": col.get("name", ""),
                "type": col.get("type", "unknown"),
                "nullable": col.get("is_nullable", True),
                "comment": col.get("comment") or "",
            }
            for col in (raw.get("columns") or [])
        ]
        result = {
            "datasource_id": datasource_id,
            "database": database,
            "table": table,
            "columns": columns,
            "row_count_estimate": raw.get("row_count"),
            "fetched_at": _now_iso(),
        }
        self._cache.set(cache_key, result)
        return result

    # ── 内部 ─────────────────────────────────────────────────────────────────

    def _get_adapter(self, datasource_id: int):
        datasource = self._repo.find_by_id(datasource_id)
        if datasource is None:
            raise ApplicationException(f"数据源不存在: {datasource_id}")
        from app.infrastructure.adapters.datasources.factory import AdapterFactory
        return AdapterFactory.create_adapter(
            datasource.source_type, datasource.connection_config
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
