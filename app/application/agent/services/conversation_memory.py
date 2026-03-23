"""
对话上下文记忆服务

基于 Redis 实现飞书信道的多轮对话上下文：
- 滑动窗口 TTL（30 分钟无交互自动过期）
- 固定条数截断（最多保留 5 轮）
- Redis 不可用时 graceful 降级为无历史
"""
from __future__ import annotations

from app.infrastructure.cache.redis_client import RedisClient
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ConversationMemory:
    """Redis 对话上下文存储"""

    KEY_PREFIX = "agent:conv:"
    DEFAULT_TTL = 1800  # 30 分钟
    MAX_MESSAGES = 10   # 5 轮（user + assistant 各一条）

    def __init__(self, redis_client: RedisClient):
        self._redis = redis_client

    def _key(self, session_id: str) -> str:
        return f"{self.KEY_PREFIX}{session_id}"

    def load(self, session_id: str) -> list[dict[str, str]]:
        """
        加载历史消息。

        key 不存在（新会话或已过期）则返回空列表。
        Redis 异常时降级为空列表，不阻断主流程。
        """
        try:
            data = self._redis.get(self._key(session_id))
            if isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.warning("ConversationMemory.load 失败，降级为无历史", error=str(e))
            return []

    def append(self, session_id: str, messages: list[dict[str, str]]) -> None:
        """
        追加消息并刷新 TTL。

        超过 MAX_MESSAGES 时截断最早的消息，保留最近的。
        """
        try:
            key = self._key(session_id)
            existing = self._redis.get(key)
            history = existing if isinstance(existing, list) else []
            history.extend(messages)

            if len(history) > self.MAX_MESSAGES:
                history = history[-self.MAX_MESSAGES:]

            self._redis.set(key, history, ttl=self.DEFAULT_TTL)
        except Exception as e:
            logger.warning("ConversationMemory.append 失败", error=str(e))

    def clear(self, session_id: str) -> None:
        """主动清除会话（用于 /reset 指令）"""
        try:
            self._redis.delete(self._key(session_id))
        except Exception as e:
            logger.warning("ConversationMemory.clear 失败", error=str(e))
