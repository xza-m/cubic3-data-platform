#!/bin/bash
set -e

export FLASK_APP=wsgi.py

# 如果第一个参数是 "rq"，直接执行 RQ Worker（跳过数据库迁移）
if [ "$1" = "rq" ]; then
    echo "Starting RQ Worker..."
    exec "$@"
fi

# 否则，执行数据库迁移并启动 Flask 应用
# 检查是否需要初始化 migrations
if [ ! -d "migrations" ]; then
    echo "Initializing database migrations..."
    flask db init || echo "Migrations already initialized"
    flask db migrate -m "init" || echo "Migration already exists"
fi

echo "Upgrading database..."
flask db upgrade || echo "Database upgrade failed or already up to date"

echo "Starting application..."
# --timeout 300: 单个请求最大执行时间 5 分钟（适应 MaxCompute 等长时间查询）
# --graceful-timeout 30: 优雅关闭等待时间
# --workers 4: worker 数量
exec gunicorn --bind 0.0.0.0:5000 --timeout 300 --graceful-timeout 30 --workers ${GUNICORN_WORKERS:-4} wsgi:app

