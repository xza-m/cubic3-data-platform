# app/application/ontology/object_search_service.py
"""
本体对象搜索服务（B-back-6）。

功能：
  - 在 list_objects() 返回的内存数据中做 ILIKE 风格的大小写不敏感模糊匹配
  - 支持多字段 OR 查询（field=name&field=metric_name 等）
  - 进程内简单滑动窗口限速（30 req/min/user），不依赖 Redis

限速实现备注：
  现有 check_rate_limit() 依赖 Redis；本期搜索为只读轻量操作，采用进程内计数器。
  若后期需要跨进程精确限速，替换为 Redis 版本即可（接口兼容）。
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any

# 允许搜索的字段白名单
ALLOWED_FIELDS = frozenset({"name", "description", "metric_name", "title", "aliases"})
DEFAULT_FIELD = "name"
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = 60.0  # 秒


class _InMemoryRateLimiter:
    """基于时间戳队列的滑动窗口限速器（单进程）。"""

    def __init__(self) -> None:
        # user_key -> deque[timestamp]
        self._windows: dict[str, deque] = {}

    def is_allowed(self, user_key: str, *, max_req: int = RATE_LIMIT_MAX, window: float = RATE_LIMIT_WINDOW) -> bool:
        now = time.monotonic()
        dq = self._windows.setdefault(user_key, deque())
        # 清理过期记录
        cutoff = now - window
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= max_req:
            return False
        dq.append(now)
        return True


_rate_limiter = _InMemoryRateLimiter()


class ObjectSearchService:
    """对本体对象列表做内存模糊搜索。"""

    def __init__(self, ontology_service) -> None:
        """
        Args:
            ontology_service: OntologyDefinitionService（需有 list_objects()）
        """
        self._ontology = ontology_service
        self._limiter = _rate_limiter

    def search(
        self,
        *,
        q: str,
        fields: list[str],
        user_key: str = "anonymous",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """执行模糊搜索，返回分页结果。

        Args:
            q: 搜索关键词（ILIKE，空字符串返回全部）
            fields: 搜索字段列表（来自 ALLOWED_FIELDS）
            user_key: 限速标识（通常是 user_id 或 IP）
            page / page_size: 分页参数

        Raises:
            PermissionError: 超出限速
            ValueError: 非法字段
        """
        # 限速检查
        if not self._limiter.is_allowed(user_key):
            raise PermissionError("请求过于频繁，请稍后再试（限速：30 次/分钟）")

        # 字段校验
        invalid = [f for f in fields if f not in ALLOWED_FIELDS]
        if invalid:
            raise ValueError(f"不支持的搜索字段: {invalid}，允许值: {sorted(ALLOWED_FIELDS)}")

        # 取全量对象
        all_objects = self._get_all_objects()

        # 过滤
        keyword = q.strip().lower()
        if keyword:
            matched = [obj for obj in all_objects if _ilike_match(obj, keyword, fields)]
        else:
            matched = list(all_objects)

        # 分页
        total = len(matched)
        page = max(1, page)
        page_size = min(max(1, page_size), 200)
        start = (page - 1) * page_size
        items = matched[start: start + page_size]

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "q": q,
            "fields": fields,
        }

    def _get_all_objects(self) -> list[dict]:
        raw = self._ontology.list_objects()
        if isinstance(raw, dict):
            return raw.get("items") or raw.get("objects") or []
        if isinstance(raw, list):
            return raw
        return []


def _ilike_match(obj: dict, keyword: str, fields: list[str]) -> bool:
    """在 obj 的 fields 中做大小写不敏感的子串匹配（模拟 SQL ILIKE %keyword%）。"""
    for field in fields:
        val = obj.get(field)
        if val is None:
            continue
        # aliases 可能是列表
        if isinstance(val, list):
            if any(keyword in str(v).lower() for v in val):
                return True
        else:
            if keyword in str(val).lower():
                return True
    return False
