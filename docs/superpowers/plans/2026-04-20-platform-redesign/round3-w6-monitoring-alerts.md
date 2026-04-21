<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w6-monitoring-alerts.md -->

# Round 3 · W6.B · 稳定期监控告警 + Incident Report 模板

> 主线工作流·2026-04-21
> 上游：W5.E（observability events / errors / sink）· W6.A（runbook + smoke）
> 配套：[`04-cutover-and-migration.md`](04-cutover-and-migration.md) §6
> 数据契约：[`observability-events.yaml`](observability-events.yaml)

---

## 1. 目标

  Day 0 切换完成后进入稳定期（Day +1 ~ Day +7）。本文件给出三件套：

  1. **告警阈值配置**（vendor-agnostic，可直接搬到 Sentry / Datadog / Grafana / 自建）
  2. **Day +1 ~ Day +7 OnCall 巡检 checklist**
  3. **Incident report 模板**（24h 内归档）

  目的：让 OnCall 不需要回看代码就能完成"看监控 → 判断严重度 → 决策"链路。

---

## 2. 告警阈值配置

  字段命名遵循 [`observability-events.yaml`](observability-events.yaml)。
  阈值分**3 档**：紧急（pager / 手机响） / 标准（IM 通知） / 观察（仪表盘红字）。

### 2.1 错误类（按 `error.kind` 分桶）

  | # | 规则名 | PromQL-style 伪代码 | 严重度 | 行动 |
  | --- | --- | --- | --- | --- |
  | A1 | API 5xx 风暴 | `rate(error{kind=api,status>=500}[5m]) > 5/min for 5m` | 紧急 | OnCall + Backend lead；考虑触发 §6 回滚条件 |
  | A2 | 401 鉴权风暴 | `rate(error{kind=api,status==401}[1m]) > 1/sec for 1m` | 紧急 | 检查 token / cookie 配置；查 §3.2 Day 0 偏好迁移 |
  | A3 | 4xx 校验高发 | `rate(error{kind=api,status>=400,status<500}[15m]) > 30/min for 15m` | 标准 | 看是否回归 / UX 表单文案问题 |
  | A4 | React 崩溃 | `rate(error{kind=react}[5m]) > 0` | 紧急 | 任意 React crash 即 P2；OnCall 拉 stack 进 incident |
  | A5 | window 全局错误 | `rate(error{kind=window}[5m]) > 3/min for 5m` | 标准 | 多为依赖脚本失败；查 CDN |
  | A6 | unhandledrejection | `rate(error{kind=unhandled}[5m]) > 3/min for 5m` | 标准 | 异步链路漏 catch；优先排查最近改动 |
  | A7 | manual report | `rate(error{kind=manual}[1h]) > 0` | 观察 | 业务侧主动上报；按 ctx 分类 |

  > **稳定期临时收紧**：D+1 ~ D+3 内，A1 / A4 阈值除以 2（即 5/min → 2.5/min）。
  > D+4 起恢复正常。

### 2.2 关键事件类（业务漏斗 / 健康度）

  | # | 规则名 | 表达式 | 严重度 | 说明 |
  | --- | --- | --- | --- | --- |
  | B1 | 登录成功率骤降 | `rate(event{name=auth.login_succeeded}[15m]) < 50% of baseline` | 紧急 | baseline = 上周同时段 |
  | B2 | 数据源测试失败率 | `rate(event{name=datasource.tested,fields.ok=false}[10m]) > 30%` | 标准 | 有可能是后端连接器 / DSN 漂移 |
  | B3 | 语义诊断失败率 | `rate(event{name=semantic.diagnose_run,fields.ok=false}[15m]) > 50%` | 紧急 | DSL 解析回归；查最近 release |
  | B4 | dry-run 失败率 | `rate(event{name=ontology.metric_dryrun,fields.ok=false}[15m]) > 40%` | 标准 | metric 模板 / SQL 生成问题 |
  | B5 | 查询执行 P95 延时 | `p95(event{name=query.executed}.fields.duration_ms[10m]) > 8000` | 标准 | 数据库慢查 / 后端瓶颈 |
  | B6 | 渠道发送失败率 | `rate(event{name=channel.test_sent,fields.ok=false}[15m]) > 20%` | 标准 | webhook / 飞书 token 漂移 |
  | B7 | 应用实例启动失败率 | `(rate(event{name=app.instance_started}) - rate(event{name=app.instance_stopped})) < 0` | 观察 | 启动 < 停止说明大量回退 |

### 2.3 平台基础设施（沿用现有监控）

  | # | 规则名 | 表达式 | 严重度 |
  | --- | --- | --- | --- |
  | C1 | 前端 nginx 5xx | `rate(http_response{code=~"5.."}[5m]) > 1% for 5m` | 紧急 |
  | C2 | API 响应 P95 | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2.0` | 标准 |
  | C3 | 数据库长事务 | `pg_stat_activity{state="active",query_start < now() - '5m'::interval}` | 紧急 |
  | C4 | 磁盘水位 | `disk_used_percent{mountpoint="/var/lib/postgresql"} > 85%` | 标准 |
  | C5 | 内存水位 | `node_memory_used_percent > 90%` | 标准 |

### 2.4 部署形态映射

  - **Sentry / Frontend Sentry-clone**（推荐 vendor）：A1-A7 / B1-B7 全部可直接落
    （事件 → Issue，错误 → Issue + grouping by `error.name`）。
  - **Datadog / Grafana**：复制 PromQL 表达式，预聚合 by `kind` 与 `name`。
  - **自建 ELK + Webhook**：HttpSink endpoint → POST 到 Logstash；
    Kibana watcher 配阈值规则，告警走 Slack / 飞书 webhook。

---

## 3. OnCall 巡检 Checklist（Day +1 ~ Day +7）

  对照 [04 §6 切换后稳定期](04-cutover-and-migration.md#6-切换后稳定期day-1--day-7)。
  每项记录在 `logs/oncall-D+N-<owner>.md`（自由格式）。

### 3.1 Day +1（D+1）— 全员值守

  - [ ] 09:00 巡检：跑 `cd frontend && npm run e2e:smoke`，6/6 必绿
  - [ ] 09:30 看 dashboard：A1 / A4 / B1 / C1 / C3 任一红线立即 incident
  - [ ] 12:00 / 15:00 / 18:00 / 21:00 各一次 dashboard 快照（截图归档）
  - [ ] 22:00 收口：当天 incident 数 / P0/P1 / P2 各 N 件
  - [ ] OnCall 交班：把开放 incident 状态写进 `logs/oncall-D+1-<owner>.md`

### 3.2 Day +2（D+2）— 收集反馈

  - [ ] 飞书群 + 工单系统抓取用户反馈（关键词："新版"、"奇怪"、"找不到"）
  - [ ] 按 [`05-governance-and-process.md`](05-governance-and-process.md) 优先级排 P0/P1/P2
  - [ ] P0 缺陷立即修，cherry-pick 进 main
  - [ ] 巡检 §3.1 同步骤

### 3.3 Day +3（D+3）— P0 修复发布

  - [ ] 如有 P0：按 §3.1 走 D+1 流程再发一次（≤ 30 min 窗口）
  - [ ] 重跑 smoke，验证修复未引入回归

### 3.4 Day +4 ~ Day +5 — 稳态观察

  - [ ] 阈值从"临时收紧"恢复到正常（A1 / A4）
  - [ ] D+5 中期回顾会：用户反馈聚类 + 性能数据对比 + 错误率趋势

### 3.5 Day +6 ~ Day +7 — 出口决策

  - [ ] D+7 出口闸门：
    - P0 = 0（必）
    - P1 ≤ 3（必）
    - 错误率 < 0.5%（必，按 A1 + A4 + A6 加和）
    - smoke 连续 3 天绿（必）
  - [ ] 任一不达标 → 进入"应急修复 sprint"，本周阻塞 Round 3 关闭
  - [ ] 全部达标 → 写 [`round3-w6-final-report`](#7-w6c-后续) 并归档

---

## 4. Incident Report 模板

  > 模板路径：本文件 §4。新建 incident 时复制到
  > `logs/incidents/<YYYY-MM-DD>-<short-slug>.md`，24 h 内必须完成。

```markdown
<!-- logs/incidents/<YYYY-MM-DD>-<slug>.md -->

# Incident · <YYYY-MM-DD> · <短标题>

## 0. 元数据

- **Severity**: P0 | P1 | P2
- **触发告警**: A1 / A4 / B3 / ...（多条用顿号）
- **影响开始**: `2026-04-?? HH:MM CST`
- **影响结束**: `2026-04-?? HH:MM CST`
- **MTTR**: `?? min`（结束 - 开始）
- **OnCall**: @<owner>
- **责任域**: frontend | backend | platform-infra | semantic | ops
- **关联 PR / commit**: `<sha>` / `<pr-link>`

## 1. 现象（What happened）

- 用户视角描述（2-3 句）
- 监控仪表盘截图：见 `assets/<filename>.png`
- 影响范围：受影响用户数 / 受影响业务模块

## 2. 时间线（Timeline）

- `HH:MM` — 告警触发（哪条规则、阈值多少）
- `HH:MM` — OnCall 响应；初步判定
- `HH:MM` — 临时缓解（rollback / 限流 / 切流量 / 关功能）
- `HH:MM` — 根因初判
- `HH:MM` — 修复发布
- `HH:MM` — 恢复确认（smoke 跑绿 + 监控回正）
- `HH:MM` — Incident 关闭

## 3. 根因（Root Cause）

- 直接原因：……
- 触发链：A → B → C → 用户可见
- 为什么没在 W4 / W5 测试中暴露：……（5-Why 至少 3 层）

## 4. 修复（Fix）

- 已上线 hotfix：`<sha>` / `<pr-link>`
- 是否触发回滚：是 / 否（如是，记录回滚耗时 + 重新切换计划）
- 后续永久性修复：跟进 ticket `<TICKET_ID>`

## 5. 行动项（Action Items）

按"修复 → 流程 → 监控 → 文档"四类：

- [ ] [修复] ……（owner: @x，DDL: `YYYY-MM-DD`）
- [ ] [流程] ……
- [ ] [监控] 增加阈值 / 新告警规则
- [ ] [文档] 更新 runbook / FAQ

## 6. 经验教训（Lessons Learned）

- 做对的：1-2 条
- 没做对的：1-2 条（避免归因到个人；归因到流程 / 工具 / 文档）
- 给后续 incident 的预警：……

## 7. 沟通归档

- 用户公告：`<link-to-station-mail>` / `<link-to-feishu>`
- 内部周报：链接 / 摘要句
- RCA 会议：日期 / 主持 / 与会人 / 会议纪要 link
```

---

## 5. 工具与脚本

### 5.1 已具备

  - `scripts/cutover/deploy.sh` / `rollback.sh`（W6.A）
  - `frontend/tests/e2e-v2/smoke/cutover-smoke.spec.ts`（W6.A）
  - `frontend/src/v2/observability/`（W5.E：sink + bootstrap + events 工厂）
  - `docs/superpowers/plans/2026-04-20-platform-redesign/observability-events.yaml`（事件契约）

### 5.2 W6.B 待办（建议挪到下个 sprint）

  - `scripts/cutover/health_probe.sh` —— 一行命令拉 dashboard 快照（5 大指标）。
  - `scripts/cutover/digest_oncall.py` —— 把 `logs/oncall-D+N-*.md` 自动汇总成 D+7 出口表。
  - `scripts/cutover/incident_init.py <slug>` —— 复制本文件 §4 模板到正确路径，
    填好 owner / 日期、git 摘要 commit。

  > 这 3 个脚本不在本周 cutover 关键路径上；OnCall 用 §4 手动走也能 ship。

---

## 6. 与 Runbook 的衔接

  - **触发回滚条件**（[04 §5.1](04-cutover-and-migration.md#51-触发条件)）→ 直接对应本文件 A1 / A4。
  - **稳定期出口**（[04 §6](04-cutover-and-migration.md#6-切换后稳定期day-1--day-7)）→ §3.5 出口闸门。
  - **后续清理**（[04 §7](04-cutover-and-migration.md#7-后续清理)）→ W6.C 接力。

---

## 7. W6.C 后续

  - 整合 D+1 ~ D+7 的 oncall 日志 + incident reports → Round 3 cutover 报告。
  - D+14 / D+21 / D+28 清理 checklist（已在 [04 §7](04-cutover-and-migration.md#7-后续清理) 列出）。
  - P04 / P17 缺口（见 [`round3-w5-freeze-rehearsal-record.md`](round3-w5-freeze-rehearsal-record.md) §5.1）：W6+1 sprint 决策"做 / 砍"。
