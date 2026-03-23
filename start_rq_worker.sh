#!/bin/bash
# RQ Worker 启动脚本（非 Docker 环境使用）

set -e

# 加载环境变量
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 设置默认值
REDIS_URL=${REDIS_URL:-redis://localhost:6379/0}
WORKER_NAME=${WORKER_NAME:-worker-$(hostname)-$(date +%s)}
QUEUE_NAME=${QUEUE_NAME:-default}

echo "======================================"
echo "RQ Worker 启动中..."
echo "======================================"
echo "Redis URL: $REDIS_URL"
echo "Worker Name: $WORKER_NAME"
echo "Queue Name: $QUEUE_NAME"
echo "======================================"

# 启动 RQ Worker
rq worker "$QUEUE_NAME" \
    --url "$REDIS_URL" \
    --name "$WORKER_NAME" \
    --with-scheduler \
    --verbose
