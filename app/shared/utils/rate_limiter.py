"""
滑动窗口频率限制器（基于 Redis INCR + EXPIRE）

用法:
    from app.shared.utils.rate_limiter import check_rate_limit
    allowed, info = check_rate_limit(redis_client, f"agent:rate:{open_id}", 10, 60)
"""
from __future__ import annotations

from typing import Any

from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def check_rate_limit(
    redis_client: Any,
    key: str,
    max_requests: int = 10,
    window_seconds: int = 60,
) -> tuple[bool, dict[str, int]]:
    """
    检查并递增频率计数器。

    Args:
        redis_client: RedisClient 实例（使用其 .client 属性访问原生 redis）
        key: 计数器键（如 "agent:rate:{open_id}"）
        max_requests: 窗口内最大请求数
        window_seconds: 窗口大小（秒）

    Returns:
        (allowed, {"current": n, "limit": max_requests, "retry_after": seconds})
    """
    try:
        raw = redis_client.client
        current = raw.incr(key)
        if current == 1:
            raw.expire(key, window_seconds)

        ttl = raw.ttl(key)
        if ttl < 0:
            raw.expire(key, window_seconds)
            ttl = window_seconds

        info = {
            "current": current,
            "limit": max_requests,
            "retry_after": ttl if current > max_requests else 0,
        }
        return current <= max_requests, info

    except Exception as e:
        logger.warning("频率限制检查失败，默认放行", error=str(e))
        return True, {"current": 0, "limit": max_requests, "retry_after": 0}
