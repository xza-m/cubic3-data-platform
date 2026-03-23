"""
缓存装饰器
用于查询结果缓存
"""
import hashlib
import json
from functools import wraps
from typing import Any
from app.infrastructure.cache.redis_client import get_redis_client
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def query_cache(key_prefix: str, ttl: int = 3600):
    """
    查询缓存装饰器
    
    Args:
        key_prefix: 缓存键前缀
        ttl: 缓存过期时间（秒），默认 1 小时
    
    Usage:
        @query_cache('list_tasks', ttl=300)
        def list_tasks_query(filters, page, page_size):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            redis_client = get_redis_client()
            
            # 生成缓存 key
            cache_key = _generate_cache_key(key_prefix, args, kwargs)
            
            # 尝试从缓存获取
            cached_result = redis_client.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for key: {cache_key}")
                return cached_result
            
            logger.debug(f"Cache miss for key: {cache_key}")
            
            # 执行函数
            result = func(*args, **kwargs)
            
            # 序列化结果（处理 Pydantic Schema）
            serialized_result = _serialize_result(result)
            
            # 存入缓存
            redis_client.set(cache_key, serialized_result, ttl)
            
            return result
        
        return wrapper
    return decorator


def invalidate_cache(key_pattern: str):
    """
    缓存失效装饰器
    
    Args:
        key_pattern: 要失效的缓存键模式
    
    Usage:
        @invalidate_cache('list_tasks:*')
        def create_task(command):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 执行函数
            result = func(*args, **kwargs)
            
            # 清除缓存
            redis_client = get_redis_client()
            redis_client.delete_pattern(key_pattern)
            logger.debug(f"Cache invalidated for pattern: {key_pattern}")
            
            return result
        
        return wrapper
    return decorator


def _generate_cache_key(prefix: str, args, kwargs) -> str:
    """
    生成缓存键
    
    Args:
        prefix: 键前缀
        args: 函数位置参数
        kwargs: 函数关键字参数
    
    Returns:
        缓存键字符串
    """
    # 构建参数字符串
    key_data = {
        'args': args,
        'kwargs': sorted(kwargs.items())
    }
    
    # 生成 hash
    key_str = json.dumps(key_data, sort_keys=True, default=str)
    key_hash = hashlib.md5(key_str.encode()).hexdigest()
    
    return f"query_cache:{prefix}:{key_hash}"


# 别名：向后兼容
cache_query = query_cache

def _serialize_result(result: Any) -> Any:
    """
    序列化查询结果
    
    处理 Pydantic Schema 的序列化
    
    Args:
        result: 查询结果
    
    Returns:
        可序列化的结果
    """
    if isinstance(result, dict):
        # 处理字典中的 Pydantic Schema 列表
        if 'items' in result and isinstance(result['items'], list):
            serialized_items = []
            for item in result['items']:
                if hasattr(item, 'model_dump'):
                    # Pydantic v2
                    serialized_items.append(item.model_dump())
                elif hasattr(item, 'dict'):
                    # Pydantic v1
                    serialized_items.append(item.dict())
                else:
                    serialized_items.append(item)
            
            return {
                **result,
                'items': serialized_items
            }
    
    # 单个 Pydantic Schema
    if hasattr(result, 'model_dump'):
        return result.model_dump()
    elif hasattr(result, 'dict'):
        return result.dict()
    
    return result
