#!/bin/bash
# scripts/rebuild-frontend.sh
# 前端容器/volume 重建脚本。
# Round 4 · Sprint 0 · T-003：在 nginx restart 前增加 backend upstream 健康度 gate，
# 避免 frontend swap 到一个上游未就绪的 backend 后整站 502。
#
# 环境变量（可选）：
#   BACKEND_CONTAINER     backend service 名，默认 backend
#   COMPOSE_FILE          compose 文件路径，默认 docker-compose.yml
#   BACKEND_HEALTH_PATH   后端健康检查路径，默认 /api/v1/health
#   BACKEND_HEALTH_PORT   容器内后端端口，默认 5000（若失败会回退 8000）
#   BACKEND_HEALTH_RETRY  探测次数，默认 5
#   BACKEND_HEALTH_DELAY  每次间隔秒数，默认 3
#   SKIP_BACKEND_HEALTH   =1 跳过探测（仅在 backend 独立 deploy 且已验证时用）
set -e

echo "========================================="
echo "前端重新构建脚本"
echo "========================================="

cd "$(dirname "$0")/.."
PROJECT_NAME=$(basename "$(pwd)")
PROJECT_NAME_UNDERSCORE=${PROJECT_NAME//-/_}

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-backend}"
BACKEND_HEALTH_PATH="${BACKEND_HEALTH_PATH:-/api/v1/health}"
BACKEND_HEALTH_PORT="${BACKEND_HEALTH_PORT:-5000}"
BACKEND_HEALTH_RETRY="${BACKEND_HEALTH_RETRY:-5}"
BACKEND_HEALTH_DELAY="${BACKEND_HEALTH_DELAY:-3}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "✗ 未找到 compose 文件：$COMPOSE_FILE"
  echo "  （Round 4 · T-003：默认已由 docker-compose.full.yml 改为 docker-compose.yml）"
  echo "  若使用自定义 compose，请显式设置 COMPOSE_FILE 环境变量。"
  exit 1
fi

echo ""
echo "步骤1: 停止frontend和nginx服务..."
docker compose -f "$COMPOSE_FILE" stop frontend nginx

echo ""
echo "步骤2: 删除旧的frontend_build volume（解决缓存问题）..."
docker volume rm -f "${PROJECT_NAME}_frontend_build" "${PROJECT_NAME_UNDERSCORE}_frontend_build" || true

echo ""
echo "步骤3: 重新构建frontend镜像..."
docker compose -f "$COMPOSE_FILE" build frontend

echo ""
echo "步骤4: 启动frontend容器（写入新volume）..."
docker compose -f "$COMPOSE_FILE" up -d frontend

echo ""
echo "步骤5: 等待文件写入完成..."
sleep 10

echo ""
echo "步骤5.5: 探测 backend upstream 健康度（Round 4 · T-003 新增）..."
if [[ "${SKIP_BACKEND_HEALTH:-0}" == "1" ]]; then
  echo "  [skip] SKIP_BACKEND_HEALTH=1，跳过 backend 健康度探测"
else
  if ! docker compose -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -qx "$BACKEND_CONTAINER"; then
    echo "  ✗ compose 文件 ${COMPOSE_FILE} 未找到 service=${BACKEND_CONTAINER}"
    echo "    设置 BACKEND_CONTAINER 环境变量或 SKIP_BACKEND_HEALTH=1 绕过"
    exit 1
  fi

  backend_ok=0
  for i in $(seq 1 "$BACKEND_HEALTH_RETRY"); do
    # 优先用 BACKEND_HEALTH_PORT，若失败回退 8000（fallback 兼容不同 WSGI 端口约定）
    if docker compose -f "$COMPOSE_FILE" exec -T "$BACKEND_CONTAINER" \
         sh -c "command -v curl >/dev/null 2>&1 && curl -sf --max-time 5 http://localhost:${BACKEND_HEALTH_PORT}${BACKEND_HEALTH_PATH}" \
         >/dev/null 2>&1; then
      backend_ok=1
      echo "  ✓ backend upstream 健康（尝试 $i/${BACKEND_HEALTH_RETRY}, port ${BACKEND_HEALTH_PORT}）"
      break
    fi
    if docker compose -f "$COMPOSE_FILE" exec -T "$BACKEND_CONTAINER" \
         sh -c "command -v curl >/dev/null 2>&1 && curl -sf --max-time 5 http://localhost:8000${BACKEND_HEALTH_PATH}" \
         >/dev/null 2>&1; then
      backend_ok=1
      echo "  ✓ backend upstream 健康（尝试 $i/${BACKEND_HEALTH_RETRY}, port 8000 fallback）"
      break
    fi
    echo "  ⏳ backend 未就绪（尝试 $i/${BACKEND_HEALTH_RETRY}）..."
    sleep "$BACKEND_HEALTH_DELAY"
  done

  if [[ "$backend_ok" -ne 1 ]]; then
    echo "  ✗ backend upstream ${BACKEND_HEALTH_RETRY} 次探测失败，abort 以避免 nginx 切到死上游"
    echo "    诊断命令："
    echo "      docker compose -f ${COMPOSE_FILE} ps ${BACKEND_CONTAINER}"
    echo "      docker compose -f ${COMPOSE_FILE} logs --tail=200 ${BACKEND_CONTAINER}"
    echo "    绕过（仅排障时）：SKIP_BACKEND_HEALTH=1 ./scripts/rebuild-frontend.sh"
    exit 1
  fi
fi

echo ""
echo "步骤6: 重启nginx以读取最新文件..."
docker compose -f "$COMPOSE_FILE" restart nginx

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
