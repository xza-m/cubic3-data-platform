#!/bin/bash
set -e

echo "=== CUBIC3 (cubic3-data-platform) 生产环境部署脚本 ==="

# 检查环境变量文件
if [ ! -f .env.prod ]; then
    echo "错误: .env.prod 文件不存在"
    echo "请复制 env.sample 并创建 .env.prod，填写生产环境配置"
    exit 1
fi

# 加载环境变量
export $(cat .env.prod | grep -v '^#' | xargs)

# 检查必要的环境变量
if [ -z "$DATABASE_URL" ] || [ -z "$SUPERSET_BASE_URL" ] || [ -z "$FEISHU_APP_ID" ]; then
    echo "错误: 缺少必要的环境变量"
    exit 1
fi

echo "1. 构建前端..."
cd frontend && npm run build && cd ..

echo "2. 构建 Docker 镜像..."
docker compose build

echo "3. 停止旧服务..."
docker compose down || true

echo "4. 启动服务..."
docker compose up -d

echo "5. 等待服务启动..."
sleep 10

echo "6. 检查服务状态..."
docker compose ps

echo "7. 检查健康状态..."
curl -f http://localhost:81/health || echo "警告: 健康检查失败（通过 nginx）"

echo ""
echo "=== 部署完成 ==="
echo "前端服务: http://localhost:81"
echo "后端API: 通过 nginx 反向代理 http://localhost:81/api（backend 容器未映射到宿主机端口）"
echo "查看日志: docker compose logs -f"
echo "停止服务: docker compose down"
