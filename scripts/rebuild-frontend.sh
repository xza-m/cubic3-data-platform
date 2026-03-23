#!/bin/bash
set -e

echo "========================================="
echo "前端重新构建脚本"
echo "========================================="

# 切换到项目根目录
cd "$(dirname "$0")/.."
PROJECT_NAME=$(basename "$(pwd)")
PROJECT_NAME_UNDERSCORE=${PROJECT_NAME//-/_}

echo ""
echo "步骤1: 停止frontend和nginx服务..."
docker compose -f docker-compose.full.yml stop frontend nginx

echo ""
echo "步骤2: 删除旧的frontend_build volume（解决缓存问题）..."
docker volume rm -f "${PROJECT_NAME}_frontend_build" "${PROJECT_NAME_UNDERSCORE}_frontend_build" || true

echo ""
echo "步骤3: 重新构建frontend镜像..."
docker compose -f docker-compose.full.yml build frontend

echo ""
echo "步骤4: 启动frontend容器（写入新volume）..."
docker compose -f docker-compose.full.yml up -d frontend

echo ""
echo "步骤5: 等待文件写入完成..."
sleep 10

echo ""
echo "步骤6: 重启nginx以读取最新文件..."
docker compose -f docker-compose.full.yml restart nginx

echo ""
echo "步骤7: 验证部署..."
sleep 2
curl -s http://localhost:81/ | grep -o 'index-[^"]*\.js' || echo "无法验证JS文件"

echo ""
echo "========================================="
echo "✅ 前端重新构建完成！"
echo "========================================="
echo ""
echo "请使用以下方式清除浏览器缓存："
echo "  - Mac: Cmd + Shift + R"
echo "  - Windows: Ctrl + F5"
echo "  - 或使用无痕模式访问 http://localhost:81"
echo ""
