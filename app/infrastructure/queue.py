"""
Redis Queue 配置与工具

提供 RQ (Redis Queue) 的初始化和管理
"""
import os
from redis import Redis
from rq import Queue


# Redis 连接配置
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# 全局 Redis 连接实例
_redis_connection = None


def get_redis_connection():
    """获取 Redis 连接（单例模式）"""
    global _redis_connection
    if _redis_connection is None:
        _redis_connection = Redis.from_url(REDIS_URL)
    return _redis_connection


def get_queue(name='default'):
    """
    获取指定名称的 RQ 队列
    
    Args:
        name: 队列名称，默认为 'default'
    
    Returns:
        Queue: RQ 队列实例
    """
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn)


def get_all_queues():
    """获取所有队列"""
    from rq import Queue as RQQueue
    redis_conn = get_redis_connection()
    return RQQueue.all(connection=redis_conn)


def clear_queue(name='default'):
    """
    清空指定队列
    
    Args:
        name: 队列名称
    
    Returns:
        int: 清除的任务数量
    """
    queue = get_queue(name)
    count = len(queue)
    queue.empty()
    return count
