"""
Redis 缓存客户端
"""
import redis
import json
from typing import Optional, Any
from flask import current_app
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class RedisClient:
    """
    Redis 缓存客户端封装
    
    职责：
    1. 提供简单的 get/set/delete 接口
    2. 自动序列化/反序列化 JSON
    3. 连接池管理
    """
    
    def __init__(self, redis_url: str = None):
        """
        Args:
            redis_url: Redis 连接URL
        """
        self.redis_url = redis_url or current_app.config.get('REDIS_URL', 'redis://localhost:6379/0')
        self._client = None
    
    @property
    def client(self):
        """获取 Redis 客户端（懒加载）"""
        if self._client is None:
            self._client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_timeout=10,
                socket_connect_timeout=10,
                socket_keepalive=True,
                retry_on_timeout=False,  # 禁用自动重试避免递归
                max_connections=50
            )
        return self._client
    
    def get(self, key: str) -> Optional[Any]:
        """
        获取缓存值
        
        Args:
            key: 缓存键
        
        Returns:
            缓存值（自动反序列化）或 None
        """
        try:
            value = self.client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning(f"Redis GET failed for key {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = 3600):
        """
        设置缓存值
        
        Args:
            key: 缓存键
            value: 缓存值（自动序列化）
            ttl: 过期时间（秒），默认 1 小时
        """
        try:
            serialized = json.dumps(value, ensure_ascii=False)
            self.client.setex(key, ttl, serialized)
        except Exception as e:
            logger.warning(f"Redis SET failed for key {key}: {e}")
    
    def delete(self, key: str):
        """
        删除缓存
        
        Args:
            key: 缓存键
        """
        try:
            self.client.delete(key)
        except Exception as e:
            logger.warning(f"Redis DELETE failed for key {key}: {e}")
    
    def delete_pattern(self, pattern: str):
        """
        删除匹配模式的所有键
        
        Args:
            pattern: 键模式（支持通配符 *）
        """
        try:
            keys = self.client.keys(pattern)
            if keys:
                self.client.delete(*keys)
                logger.debug(f"Deleted {len(keys)} keys matching pattern: {pattern}")
        except Exception as e:
            logger.warning(f"Redis DELETE_PATTERN failed for pattern {pattern}: {e}")
    
    def exists(self, key: str) -> bool:
        """
        检查键是否存在
        
        Args:
            key: 缓存键
        
        Returns:
            是否存在
        """
        try:
            return self.client.exists(key) > 0
        except Exception as e:
            logger.warning(f"Redis EXISTS failed for key {key}: {e}")
            return False
    
    def ttl(self, key: str) -> int:
        """
        获取键的剩余过期时间
        
        Args:
            key: 缓存键
        
        Returns:
            剩余秒数，-1 表示永不过期，-2 表示键不存在
        """
        try:
            return self.client.ttl(key)
        except Exception as e:
            logger.warning(f"Redis TTL failed for key {key}: {e}")
            return -2


# ============================================================================
# 便捷函数
# ============================================================================

def get_redis_client() -> RedisClient:
    """获取 Redis 客户端实例"""
    return RedisClient()
