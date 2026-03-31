"""
RQ Worker 启动脚本
"""
import os
from rq import Worker
from redis import Redis
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def start_worker(redis_url: str = None, queues: list = None):
    """
    启动 RQ Worker
    
    Args:
        redis_url: Redis 连接URL
        queues: 要监听的队列列表，默认 ['default']
    """
    if redis_url is None:
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    
    if queues is None:
        queues = ['default']
    
    logger.info(f"Connecting to Redis: {redis_url}")
    logger.info(f"Listening to queues: {queues}")
    
    redis_conn = Redis.from_url(redis_url)
    worker = Worker(queues, connection=redis_conn)
    logger.info("RQ Worker started successfully")
    worker.work()


if __name__ == '__main__':
    """
    命令行启动：
    
    python -m app.infrastructure.tasks.rq_worker
    
    或指定 Redis URL：
    
    REDIS_URL=redis://localhost:6379/0 python -m app.infrastructure.tasks.rq_worker
    """
    start_worker()
