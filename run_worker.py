#!/usr/bin/env python
"""
RQ Worker 启动脚本

在 Flask app context 中运行 RQ Worker
"""
import os
import sys
from redis import Redis
from rq import Worker

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app

app = create_app(role="worker")

redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
redis_conn = Redis.from_url(redis_url)


def run_worker():
    """在 Flask app context 中运行 Worker"""
    with app.app_context():
        import socket
        hostname = socket.gethostname()[:12]
        worker = Worker(
            ['default'],
            connection=redis_conn,
            name=f'worker-{hostname}-{os.getpid()}'
        )

        print(f'Starting RQ Worker (PID: {os.getpid()})...')
        print(f'Redis URL: {redis_url}')
        print(f'Queues: {worker.queue_names()}')

        worker.work(with_scheduler=False)


if __name__ == '__main__':
    run_worker()
