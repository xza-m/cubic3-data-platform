#!/usr/bin/env bash
# scripts/cutover/deploy.sh
#
# Round 3 · W6.A · Day 0 切换部署脚本。
# Round 4 · Sprint 0 · T-002：增加 alembic 自动 upgrade；T-003：rebuild 阶段增加 backend 健康度 gate。
#
# 用法：
#   ./scripts/cutover/deploy.sh                  # 真切（生产）
#   ./scripts/cutover/deploy.sh --dry-run        # 干跑（跳过 git tag + migrate + nginx 重启）
#   ./scripts/cutover/deploy.sh --skip-migrate   # 跳过 alembic upgrade（DBA 手动处理时用）
#
# 环境变量（可选）：
#   BACKEND_CONTAINER   docker-compose.yml 中 backend service 名，默认 backend
#   COMPOSE_FILE        compose 文件路径，默认 docker-compose.yml
#                       （若仍在使用旧 docker-compose.full.yml，显式设置 COMPOSE_FILE）
#
# 行为对齐 docs/superpowers/plans/2026-04-20-platform-redesign/
# 04-cutover-and-migration.md §3 切换日 Runbook：
#   T-15  pre-flight gate（make verify-cutover · v2-only · 见 Round 3 W6）
#   T-10  打 cutover-<date> 标签（rollback 锚点）
#   T- 5  alembic head 探测 + flask db upgrade head（Round 4 T-002 新增；可 --skip-migrate）
#   T  0  vite 构建 v2 产物（无 VITE_AUTH_BYPASS）
#   T+ 1  调用 ./scripts/rebuild-frontend.sh 切 nginx volume（含 backend 健康度 gate）
#   T+ 5  smoke check：/api/v1/health + /dashboard
#
# Exit codes：
#   0 = 成功
#   1 = pre-flight 失败（verify-cutover）
#   2 = build 失败
#   3 = nginx swap 失败（rebuild-frontend.sh）
#   4 = post-deploy smoke 失败
#   5 = db migrate 失败（Round 4 T-002 新增）
#
# 日志：./logs/cutover-<timestamp>.log

set -euo pipefail

# ── 配置区 ────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
SKIP_MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    -h|--help)
      sed -n '2,24p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数：$arg" >&2
      exit 64
      ;;
  esac
done

BACKEND_CONTAINER="${BACKEND_CONTAINER:-backend}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

TS="$(date +%Y%m%d-%H%M%S)"
DATE_TAG="$(date +%Y%m%d)"
TAG_NAME="cutover-${DATE_TAG}"
LOG_DIR="$REPO_ROOT/logs"
LOG_FILE="$LOG_DIR/cutover-${TS}.log"
START_EPOCH=$(date +%s)

mkdir -p "$LOG_DIR"

# ── 工具函数 ──────────────────────────────────────────────────────────────────
log()      { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }
phase()    {
  local elapsed=$(( $(date +%s) - START_EPOCH ))
  local sign="+"
  # 在前置阶段（pre-flight + tag + build 之前）用 T-XX 标识，部署后用 T+XX。
  if [[ "${1:-}" == "pre" ]]; then sign="-"; shift; fi
  printf '\n[T%s%02d] %s\n' "$sign" "$elapsed" "$*" | tee -a "$LOG_FILE"
}
fail() {
  local code="$1"; shift
  log "✗ FAIL ($code): $*"
  log "总耗时 $(( $(date +%s) - START_EPOCH )) s · 详细日志：$LOG_FILE"
  exit "$code"
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY-RUN 模式：将跳过 git tag + nginx volume 切换 + nginx 重启。"
fi
log "切换部署开始 · 仓库根 $REPO_ROOT · 日志 $LOG_FILE"

# ── 阶段 1：pre-flight gate（T-15） ──────────────────────────────────────────
# 使用 verify-cutover（v2-only）而非历史的 verify-frontend：
#   - verify-frontend 链上还挂着 W4 cutover 后已清空的 src/pages/*.test.tsx
#     legacy spec（标记为 DEPRECATED 的 test-regression-platform-* 目标）。
#   - verify-cutover = lint + tsc + lint:css + check:v2-tokens + vitest src/v2 + e2e:smoke。
phase pre "Pre-flight：make verify-cutover（v2-only · fail-fast）"
if ! make verify-cutover >>"$LOG_FILE" 2>&1; then
  fail 1 "make verify-cutover 未通过；切换被拒绝。详见 $LOG_FILE 末段。"
fi
log "✓ pre-flight 通过"

# ── 阶段 2：打 rollback 锚点（T-10） ─────────────────────────────────────────
phase pre "Tag：${TAG_NAME}（rollback 锚点）"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "  [dry-run] 跳过 git tag"
else
  if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    log "  ⚠ 标签 ${TAG_NAME} 已存在，跳过新建"
  else
    git tag -a "$TAG_NAME" -m "cutover ${DATE_TAG} (auto by deploy.sh)" >>"$LOG_FILE" 2>&1 \
      || fail 1 "git tag 失败"
    log "  ✓ 已打标签 ${TAG_NAME}（HEAD=$(git rev-parse --short HEAD)）"
  fi
fi

# ── 阶段 2.5：alembic upgrade（T-5） ─────────────────────────────────────────
# Round 4 · Sprint 0 · T-002：在 swap 前自动拉齐 DB schema，避免"前端切到新版后 500/502"
# 的生产事故。要求：backend 容器已在线（backend 由独立 CD 路径先部署）。
phase pre "DB migrate：flask db upgrade head（backend 容器 ${BACKEND_CONTAINER}）"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "  [dry-run] 跳过 db migrate"
elif [[ "$SKIP_MIGRATE" -eq 1 ]]; then
  log "  [skip] 跳过 db migrate（--skip-migrate）；DBA 需手动保证 alembic head 一致"
else
  if ! docker compose -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -qx "$BACKEND_CONTAINER"; then
    fail 5 "compose 文件 ${COMPOSE_FILE} 中未找到 service=${BACKEND_CONTAINER}（可通过 BACKEND_CONTAINER 环境变量覆盖）"
  fi
  log "  → 探测当前 alembic 版本"
  if ! docker compose -f "$COMPOSE_FILE" exec -T "$BACKEND_CONTAINER" flask db current >>"$LOG_FILE" 2>&1; then
    fail 5 "flask db current 失败：backend 容器未就绪或 flask CLI 不可用。建议：docker compose -f ${COMPOSE_FILE} ps ${BACKEND_CONTAINER}"
  fi
  log "  → 执行 flask db upgrade head"
  if ! docker compose -f "$COMPOSE_FILE" exec -T "$BACKEND_CONTAINER" flask db upgrade head >>"$LOG_FILE" 2>&1; then
    fail 5 "flask db upgrade head 失败；回滚建议：flask db downgrade <prev_rev> · 详见 $LOG_FILE"
  fi
  log "  ✓ alembic 已升级至 head"
fi

# ── 阶段 3：构建 v2 产物（T 0） ─────────────────────────────────────────────
phase "Build：cd frontend && vite build (生产模式，无 VITE_AUTH_BYPASS)"
(
  cd "$REPO_ROOT/frontend"
  # 显式置空 VITE_AUTH_BYPASS：哪怕开发者 shell 里有遗留，也不会泄露到生产产物。
  VITE_AUTH_BYPASS= npx vite build --config v2.vite.config.ts --emptyOutDir
) >>"$LOG_FILE" 2>&1 || fail 2 "vite build 失败"
log "✓ vite build 通过"

# ── 阶段 4：nginx volume swap（T+1） ────────────────────────────────────────
phase "Rebuild & swap：./scripts/rebuild-frontend.sh"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "  [dry-run] 跳过 docker volume 切换 + nginx restart"
else
  ./scripts/rebuild-frontend.sh >>"$LOG_FILE" 2>&1 || fail 3 "rebuild-frontend.sh 失败"
  log "  ✓ 容器 + volume 切换完成"
fi

# ── 阶段 5：post-deploy smoke check（T+5） ──────────────────────────────────
phase "Smoke：/api/v1/health & /dashboard"
post_check_ok=1
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "  [dry-run] 跳过 HTTP 探测"
else
  for url in "http://localhost:81/api/v1/health" "http://localhost:81/dashboard"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo "000")
    if [[ "$code" == "200" ]]; then
      log "  ✓ $url → $code"
    else
      log "  ✗ $url → $code"
      post_check_ok=0
    fi
  done
  if [[ "$post_check_ok" -ne 1 ]]; then
    fail 4 "post-deploy smoke check 未通过；进入 §5 回滚剧本。"
  fi
fi

# ── 收尾 ─────────────────────────────────────────────────────────────────────
phase "Done"
log "✓ 切换完成 · 总耗时 $(( $(date +%s) - START_EPOCH )) s"
log "下一步：执行人工烟测 + 解除 CI/CD 冻结，详见 04-cutover-and-migration.md §3"
log "完整日志：$LOG_FILE"
exit 0
