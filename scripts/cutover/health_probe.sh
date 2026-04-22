#!/usr/bin/env bash
# scripts/cutover/health_probe.sh
#
# Round 4 · Sprint 0 · T-004a — 部署后健康探测：API + 业务 metrics + 5 大模块首屏（SPA shell）。
#
# 用法：
#   ./scripts/cutover/health_probe.sh
#   BASE_URL=https://example.com ./scripts/cutover/health_probe.sh
#   NO_COLOR=1 ./scripts/cutover/health_probe.sh
#
# 环境变量（可选）：
#   BASE_URL         带 scheme 的入口，默认 http://localhost:81
#   CURL_MAX_TIME    单次请求超时（秒），默认 10
#   ONLY_API         1 = 只跑 API/health 段，不跑 5 大模块 SPA（CI 可加速）
#   QUIET            1 = 仅 exit code，无表格输出
#
# 退出码：0 全部通过，1 任意失败
#
# 说明（/metrics）：
#   本仓库无匿名 Prometheus /metrics，「指标」以 Ontology 列表 API
#   GET /api/v1/ontology/metrics 为代表；无 JWT 时预期 401，视为可接受（与 200 等价「路由存活」）。

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BASE_URL="${BASE_URL:-http://localhost:81}"
# 去掉尾斜杠，避免双斜杠
BASE_URL="${BASE_URL%/}"
CURL_MAX_TIME="${CURL_MAX_TIME:-10}"
ONLY_API="${ONLY_API:-0}"
QUIET="${QUIET:-0}"

RED=''; GREEN=''; YELLOW=''; DIM=''; NC=''
if [[ -t 1 ]] && [[ "${NO_COLOR:-0}" != "1" ]]; then
  RED=$'\e[0;31m'; GREEN=$'\e[0;32m'; YELLOW=$'\e[0;33m'; DIM=$'\e[0;2m'; NC=$'\e[0m'
fi

pass_count=0
fail_count=0
declare -a FAIL_LINES=()

log_ok()  { if [[ "$QUIET" != "1" ]]; then echo -e "  ${GREEN}OK${NC}  $*"; fi; }
log_bad() { if [[ "$QUIET" != "1" ]]; then echo -e "  ${RED}FAIL${NC} $*"; fi; }
log_h()   { if [[ "$QUIET" != "1" ]]; then echo -e "\n${DIM}── $* ──${NC}"; fi; }

# $1=label $2=url $3=空间分隔的可接受状态码
probe_codes() {
  local label="$1" url="$2" allowed="$3"
  local code body_err
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$CURL_MAX_TIME" "$url" 2>/dev/null || true)
  if [[ -z "$code" || "$code" == "000" ]]; then
    code="000"
  fi
  local ok=0
  for c in $allowed; do
    if [[ "$code" == "$c" ]]; then ok=1; break; fi
  done
  if [[ "$ok" -eq 1 ]]; then
    pass_count=$((pass_count + 1))
    log_ok "$label  ${DIM}→${NC} $code  ${DIM}$url${NC}"
  else
    fail_count=$((fail_count + 1))
    log_bad "$label  ${DIM}→${NC} $code  (allow: $allowed)  ${DIM}$url${NC}"
    FAIL_LINES+=("$label $code $url (allow: $allowed)")
  fi
}

# $1=label $2=url — SPA 首屏：应返回 200 且为 HTML
probe_spa() {
  local label="$1" url="$2"
  local code ctype hdr
  hdr=$(mktemp "${TMPDIR:-/tmp}/hp-XXXXXX")
  code=$(curl -sS -D "$hdr" -o /dev/null -w '%{http_code}' --max-time "$CURL_MAX_TIME" "$url" 2>/dev/null || true)
  # 兼容 BSD awk（无 IGNORECASE）：先 strip \r 再忽略大小写匹配 Content-Type
  ctype=$(tr -d '\r' < "$hdr" | awk -F': ' 'BEGIN{OFS=":"} tolower($1)=="content-type"{print $2; exit}' 2>/dev/null || true)
  rm -f "$hdr"
  [[ -z "$code" ]] && code="000"
  if [[ "$code" == "200" && "$ctype" == *"text/html"* ]]; then
    pass_count=$((pass_count + 1))
    log_ok "$label  ${DIM}→${NC} 200 text/html  ${DIM}$url${NC}"
  else
    fail_count=$((fail_count + 1))
    log_bad "$label  ${DIM}→${NC} $code  ctype=${ctype:-?}  ${DIM}$url${NC}"
    FAIL_LINES+=("$label $code $url (expect 200 text/html)")
  fi
}

if [[ "$QUIET" != "1" ]]; then
  echo "health_probe · T-004a · BASE_URL=$BASE_URL"
fi

# ── 1) /api/v1/health + /health（Runbook 与 canonical） ──
log_h "API 存活"
probe_codes "GET /api/v1/health (runbook)" "$BASE_URL/api/v1/health" "200"
probe_codes "GET /health (canonical)" "$BASE_URL/health" "200"

# ── 2) Ontology metrics 列表（业务「指标」读 API） — 无 session 时 401 为预期 ──
log_h "业务 metrics（Ontology 指标列表 API）"
probe_codes "GET /api/v1/ontology/metrics" "$BASE_URL/api/v1/ontology/metrics" "200 401 403"

# ── 3) 5 大模块首屏（Dashboard / 数据 / 查询 / 语义 / 应用） ──
if [[ "$ONLY_API" == "1" ]]; then
  if [[ "$QUIET" != "1" ]]; then
    echo -e "\n${DIM}[ONLY_API=1] 已跳过 5 大模块 SPA 探测${NC}"
  fi
else
  log_h "5 大模块首屏（SPA / nginx try_files）"
  probe_spa "模块·总览" "$BASE_URL/dashboard"
  probe_spa "模块·数据" "$BASE_URL/data-center/datasources"
  probe_spa "模块·查询" "$BASE_URL/queries"
  probe_spa "模块·语义" "$BASE_URL/semantic/ontology"
  probe_spa "模块·应用" "$BASE_URL/apps"
fi

# ── 总结 ──
if [[ "$QUIET" != "1" ]]; then
  echo ""
  if [[ "$fail_count" -eq 0 ]]; then
    echo -e "${GREEN}✓ health_probe 通过${NC}  ($pass_count checks)"
  else
    echo -e "${RED}✗ health_probe 失败${NC}  通过 $pass_count · 失败 $fail_count"
    for line in "${FAIL_LINES[@]:-}"; do
      echo -e "  ${RED}·${NC} $line" >&2
    done
  fi
fi

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
exit 0
