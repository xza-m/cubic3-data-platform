#!/usr/bin/env bash
# scripts/cutover/rollback.sh
#
# Round 3 · W6.A · Day 0 紧急回滚脚本。
#
# 用法：
#   ./scripts/cutover/rollback.sh                 # 自动定位最近 cutover-* 标签
#   ./scripts/cutover/rollback.sh --to <ref>      # 显式指定 commit / tag
#   ./scripts/cutover/rollback.sh --to <ref> --yes  # CI / 自动化跳过确认
#
# 行为对齐 04-cutover-and-migration.md §5 回滚剧本：
#   1. 定位 cutover-<date> 标签 → 取被部署的 commit
#   2. git revert --no-edit <cutover-sha>
#   3. ./scripts/rebuild-frontend.sh 切回 nginx volume
#   4. 烟雾 GET /api/v1/health
#   5. 总耗时断言 ≤ 30 min（超出仅 warn，不 abort）
#
# Exit codes：
#   0 = 成功
#   1 = 解析 / 校验失败（找不到 tag、确认拒绝等）
#   2 = git revert 冲突 / 失败
#   3 = nginx swap 失败
#   4 = post-rollback smoke 失败

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_REF=""
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --to)
      shift || true ;;
    --to=*) TARGET_REF="${arg#*=}" ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      # 兼容 `--to <ref>` 语法
      if [[ -z "$TARGET_REF" && "$arg" != --* ]]; then
        TARGET_REF="$arg"
      fi
      ;;
  esac
done

TS="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$REPO_ROOT/logs"
LOG_FILE="$LOG_DIR/rollback-${TS}.log"
START_EPOCH=$(date +%s)
TIME_BUDGET_S=1800  # 30 min

mkdir -p "$LOG_DIR"

# ── 工具函数 ──────────────────────────────────────────────────────────────────
log()   { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }
phase() {
  local elapsed=$(( $(date +%s) - START_EPOCH ))
  printf '\n[ROLLBACK T+%02d] %s\n' "$elapsed" "$*" | tee -a "$LOG_FILE"
}
fail() {
  local code="$1"; shift
  log "✗ FAIL ($code): $*"
  log "总耗时 $(( $(date +%s) - START_EPOCH )) s · 详细日志：$LOG_FILE"
  exit "$code"
}

# ── 解析回滚目标 ──────────────────────────────────────────────────────────────
phase "Resolve：定位回滚目标"
if [[ -z "$TARGET_REF" ]]; then
  TARGET_REF=$(git tag --sort=-creatordate --list 'cutover-*' | head -n 1 || true)
  if [[ -z "$TARGET_REF" ]]; then
    fail 1 "未指定 --to 且找不到任何 cutover-* 标签；请显式传 --to <sha-or-tag>。"
  fi
  log "  自动选择最近标签：$TARGET_REF"
fi

if ! git rev-parse --verify "${TARGET_REF}^{commit}" >/dev/null 2>&1; then
  fail 1 "无法解析 ref：$TARGET_REF"
fi
CUTOVER_SHA=$(git rev-parse "${TARGET_REF}^{commit}")
SHORT_SHA=$(git rev-parse --short "$CUTOVER_SHA")
log "  目标 commit：$SHORT_SHA  ($(git log -1 --format='%s' "$CUTOVER_SHA"))"

# ── 二次确认 ──────────────────────────────────────────────────────────────────
if [[ "$ASSUME_YES" -ne 1 ]]; then
  printf '\n即将 git revert %s 并触发 nginx 切换。继续？ [y/N] ' "$SHORT_SHA"
  read -r ANSWER
  case "${ANSWER:-N}" in
    y|Y|yes|YES) : ;;
    *) fail 1 "用户取消。" ;;
  esac
fi

# ── 阶段 1：git revert ───────────────────────────────────────────────────────
phase "Revert：git revert --no-edit $SHORT_SHA"
if ! git revert --no-edit "$CUTOVER_SHA" >>"$LOG_FILE" 2>&1; then
  log "  ✗ revert 失败（很可能存在冲突）；请手动解决后再次运行。"
  fail 2 "git revert 失败"
fi
log "  ✓ revert commit：$(git rev-parse --short HEAD)"

# ── 阶段 2：nginx swap ───────────────────────────────────────────────────────
phase "Rebuild & swap：./scripts/rebuild-frontend.sh"
./scripts/rebuild-frontend.sh >>"$LOG_FILE" 2>&1 || fail 3 "rebuild-frontend.sh 失败"
log "  ✓ 容器 + volume 切换完成"

# ── 阶段 3：post-rollback smoke ──────────────────────────────────────────────
phase "Smoke：/api/v1/health"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://localhost:81/api/v1/health" || echo "000")
if [[ "$code" == "200" ]]; then
  log "  ✓ /api/v1/health → $code"
else
  log "  ✗ /api/v1/health → $code"
  fail 4 "post-rollback smoke check 未通过；上报 incidents。"
fi

# ── 阶段 4：时间预算断言 ─────────────────────────────────────────────────────
elapsed=$(( $(date +%s) - START_EPOCH ))
phase "Done"
log "✓ 回滚完成 · 总耗时 ${elapsed} s"
if (( elapsed > TIME_BUDGET_S )); then
  log "  ⚠ 超出 ${TIME_BUDGET_S}s（30 min）预算 → 请在 RCA 中分析阻塞点。"
fi
log "下一步：发"已回滚"公告 + 24h 内提交 incident report。"
log "完整日志：$LOG_FILE"
exit 0
