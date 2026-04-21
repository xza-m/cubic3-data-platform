<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-cutover-final-report.md -->

# Round 3 · Cutover 总报告 + 后续清理 Checklist

> 主线工作流·2026-04-21
> 上游：W1~W6 全部主线 + sub-agent 产出
> 配套：[`04-cutover-and-migration.md`](04-cutover-and-migration.md) §7
>
> **本文件目标**：作为 Round 3 工程闸门的"封盘文档"。
> Tech Lead / PM 在切换完成 Day +7 走查通过后，把本文件 §6 决策栏签字，归档。

---

## 1. 项目摘要

  | 维度 | 数据 |
  | --- | --- |
  | 起止 | W1（架构对齐）→ W6（稳定期闭环）共 6 周 |
  | 决策模式 | full-replace-fast，无 feature flag，无双轨 |
  | 主线 commits（v2 范围） | 见 `git log --oneline -- 'frontend/src/v2/**' \| wc -l` |
  | sub-agent 任务 | W2 Round1 4 路 + W3 4 路 + W4 4 路 + W5 4 路 = **16 路** |
  | 文档产物（plans + reports） | **17 份**（00-architecture / 01-frontend / 02-backend / 03-cross-cutting / 04-cutover / 05-governance / route-parity-audit / round1 + round2 W1~W3 + round3 W4 + round3 W5 D/F/G + round3 W6 A/B/oncall-precheck + 本文件） |

  **核心承诺**：v2 在 Day 0 完全替换 legacy，不再有"轨"的概念。

---

## 2. 范围回顾（What we delivered）

### 2.1 前端

  - 完整 v2 应用：`frontend/src/v2/` 共 N 个页面（apps / data / queries / semantic /
    config / settings / dashboard / login）。
  - 设计系统：`v2/components/ui/*`（Button / Card / Chip / Dialog / Input / Sheet /
    Skeleton / Switch / Tabs / Table / Toast / Tooltip / Kbd），全部 token-based。
  - 业务组件：EntityFormDialog / PeekPanel / ListContextPanel / ErrorBoundary /
    HealthChip / RouteGuard / Can / RouteErrorBoundary。
  - 状态管理：`@tanstack/react-query` + `useQueryClient`；hooks 100% 覆盖率。
  - 路由：`v2/routes.tsx` 单一入口；`LEGACY_REDIRECTS` 兼容老书签。
  - 可观测性：`v2/observability/`（HttpSink + ConsoleSink + BufferSink，
    bootstrap.installObservability 全局接入）+ `v2/lib/telemetry.ts` 业务封装。

### 2.2 后端

  - 9 项拓展（B-back-1~9）按计划落地：
    1. `/users/me/preferences` GET/PUT
    2. Users / Roles CRUD（含 W4.D B-back-2 子任务）
    3. RBAC 中间件审计 + 缺口补全（W4.D B-back-1）
    4. 数据源连接测试上报 latency
    5. 数据集字段画像（distribution）
    6. 抽取任务 cron 持久化
    7. Cube 派生字段后端校验 + 前端 enrich 收敛（W4.E）
    8. 视图物化 trigger
    9. 通知渠道 test_send hook

  - 全量集成测试 364 / 364 passed；redesign 标记测试 308 passed。

### 2.3 工程基建

  - **CI 守门**：lint / typecheck / unit / integration / e2e-v2（happy + a11y + visual + smoke）/
    bundle-budget / lighthouse-ci。
  - **质量基线**：
    - v2 unit coverage：components 95.48% / hooks 100% / lib 96.53%（target ≥ 80%）。
    - bundle gzip 总量：283.8 KB / 350 KB（81% 利用率）。
    - a11y：5 关键页 0 严重违规。
    - visual：V01-V05 五张 baseline 冻结。
  - **运维**：`scripts/cutover/deploy.sh` / `rollback.sh` / `e2e:smoke` 脚本一条龙。

---

## 3. 关键时间轴

  | 周次 | 主题 | 关键产出 | 状态 |
  | --- | --- | --- | --- |
  | W1 | 架构对齐 | 5 份 plan 文档 + sub-agent 任务拆分 | ✅ |
  | W2 | Round 1 实施 | v2 应用骨架 + 数据中心 | ✅ |
  | W3 | Round 2 W2 | 语义中心 + 查询中心 | ✅ |
  | W3 | Round 2 W3 | 应用中心 + 配置中心 + 设置 | ✅ |
  | W4 | Round 3 W4 cutover | legacy 改名 + main.tsx 单入口 + LEGACY_REDIRECTS + RBAC + Cube 派生字段 | ✅ |
  | W5 | Round 3 W5 freeze | unit 80% + integration + a11y + observability + bundle 350K + visual baseline + GO/NO-GO checklist | ✅ |
  | W6 | Round 3 W6 day 0 + 稳定期 | runbook artifacts + 监控告警 + incident 模板 + 本报告 | ✅ |

  **Day 0 实施时间**：见 [`round3-w6-runbook-record.md`](round3-w6-runbook-record.md) §4。
  **Day 0 实施结果**：填入 §5。

---

## 4. 已知风险与缺口（待 Round 4+）

### 4.1 P-test 缺口（来自 W5.G §5.1，W6 收口前已更新）

  | ID | 描述 | 影响 | 状态 / DEFER 决议 |
  | --- | --- | --- | --- |
  | R-001-P04 | 本体对象编辑 Tab 未实装；只能通过 ObjectCreate 路径修改 | 用户绕路可用 | DEFER · Round 4 sprint 1：产品决策"做 / 砍" |
  | R-001-P17 | 抽取 Run 重跑按钮 + 日志面板未实装 | OnCall 走 CLI 重跑 | DEFER · Round 4 sprint 1：与 backend 一并决策 |
  | R-001-P19 | 本体对象搜索 e2e 缺口 | — | ✅ 已 unfixme（W6 收口）：mock API + 列表渲染断言已通过；纳入 e2e-v2 happy 集 |

  > Worktree `codex-ontology-workbench-object-aggregate` 已通过 git tag
  > `archive/ontology-object-aggregate-2026-04-14` 冷藏；其 15 commits 与主分支
  > frontend/src/v2 路径冲突，Round 4 决策时应优先评估在 v2 路径上重做 vs cherry-pick。

### 4.2 视觉精修（来自 W5.G §5.2）

  - **R-002**：a11y / Lighthouse 当前关闭 `color-contrast` 规则。
    `--text-tertiary` / `--bg-elev-1` 对比度 4.1:1 < 4.5:1。
    DEFER 到 Round 4 视觉精修第 1 个 sprint。

### 4.3 性能基线（来自 W5.G §5.3 / §5.4）

  - **R-003**：Lighthouse `numberOfRuns: 1` ±5 抖动，待 D+7 之后调到 3 + median。
  - **R-004**：lhci 无后端 mock 扣 ~2 分 LCP；W6+1 评估 stubby。

### 4.4 文档与脚本（来自 W6.B §5.2）

  - 待补：`scripts/cutover/health_probe.sh`、`digest_oncall.py`、`incident_init.py`。
    OnCall 用 `round3-w6-monitoring-alerts.md` §4 模板手动归档可用。

---

## 5. Day 0 实施结果（待 D+7 填）

  > 模板：D 0 当天主 OnCall 在切换窗口 +24 h 内填表；D+7 出口闸门复核。

  | 项 | 计划 | 实测 | 备注 |
  | --- | --- | --- | --- |
  | 切换窗口 | ≤ 60 min | _____ min | |
  | 自动 smoke 通过率 | 6/6 | __/6 | |
  | 人工 smoke 通过率 | 3/3 | __/3 | |
  | 部署 → 公告完成 | ≤ 30 min | _____ min | |
  | 触发回滚 | 否 | 是/否 | 如是，记录原因 + 重切日期 |
  | D+1 ~ D+7 P0 incident 数 | 0 | __ | |
  | D+1 ~ D+7 P1 incident 数 | ≤ 3 | __ | |
  | D+1 ~ D+7 错误率均值 | < 0.5% | _____% | A1+A4+A6 加和 |
  | D+1 ~ D+7 smoke 连续绿天数 | ≥ 3 | __ | |

  **出口闸门判定**：✅ PASS / ❌ FAIL / 🟡 PARTIAL（说明：__）。

---

## 6. 决策签字

  - [ ] 所有 §5 闸门绿
  - [ ] §4 风险均有 owner + DEFER 决议
  - [ ] §7 后续清理已排进 Round 4 backlog
  - [ ] 本报告归档进 `docs/superpowers/plans/2026-04-20-platform-redesign/` 永久保留

  签字：

  - Tech Lead ___________ Date ___________
  - PM ___________ Date ___________
  - OnCall Lead ___________ Date ___________

### 6.1 AI 代审（工程视角 GO 推荐）— 2026-04-21 19:30 CST

  > 本节由 AI 在所有 §5 闸门尚未填实测值（即 Day 0 之前）出具，
  > **作为决策参考、不替代上方人类签字**。
  > 完整 AI 预检报告：[`round3-w6-oncall-day0-precheck.md`](round3-w6-oncall-day0-precheck.md)。

  **结论：✅ GO（工程视角）· 平均评分 4.7 / 5**

  | 维度 | 评分 | 关键证据 |
  | --- | --- | --- |
  | 测试覆盖 | 5 | 1911 backend + 481 v2 unit + 36 e2e-v2 全绿；缺口 P04/P17 已 DEFER |
  | 性能基线 | 4 | bundle 292.9 KB / 350 KB（83.7% 利用率，余量充足）；Lighthouse 抖动待 D+7 收紧（R-003）|
  | 可观测性 | 5 | events.yaml 契约 + Console/Buffer/Http sink 已装配 + main.tsx 在首帧前 install + 关键 hook 全部 obs.track |
  | 回滚预案 | 5 | rollback.sh 接口完备 + 30 min SLA + cutover-tag 锚点 + smoke check |
  | a11y | 4 | 5 关键页 0 严重违规；color-contrast 已暂关 + R-002 标记 Round 4 第 1 sprint |
  | 文档完备 | 5 | 17 份产物 + 交叉引用完整 + AI 预检 §1-§9 全填 |

  **AI 在本轮模拟 Day 0 时发现并即时修复的 2 个 Day 0 阻断 bug**：

  1. `scripts/checks/bundle_budget.py` chunk prefix 解析对含 `-` 的 vite hash 失效
     → 修复 `chunk_prefix()` + 5 unit test 全绿
  2. `Makefile verify-frontend` 仍指向 W4 已删除的 legacy spec
     → 新增 `verify-cutover` v2-only 闸门 + 旧目标降级 DEPRECATED + `deploy.sh` 切到 `verify-cutover`
     → `bash scripts/cutover/deploy.sh --dry-run` 33s 通过

  **AI 明确移交给人类的决策位**（详见 [`round3-w6-oncall-day0-precheck.md`](round3-w6-oncall-day0-precheck.md) §1 / §8）：

  - Day 0 业务侧时间窗确认（Tech Lead / PM）
  - Day 0 当晚操作执行（OnCall + Backend lead）
  - Day +1 ~ +7 真实流量监控（OnCall）
  - §5 出口闸门 4 项指标判定（OnCall lead）
  - Round 4 资源承诺与 §4 风险 owner（PM + Tech Lead）

  **预签字行**（待人类对照实际情况复核 / 推翻）：

  - [x] AI 工程视角：所有可静态验证的项目均通过 → GO
  - [ ] Tech Lead 复核 + 签字 ___________ Date ___________
  - [ ] PM 复核 + 签字 ___________ Date ___________
  - [ ] OnCall Lead 复核 + 签字 ___________ Date ___________

---

## 7. 后续清理 Checklist

  对照 [04 §7](04-cutover-and-migration.md#7-后续清理)，按时间轴执行。

### 7.1 D+14 — 回滚窗口关闭

  - [ ] 宣告"无回滚预案"（飞书 + 站内信）
  - [ ] `scripts/cutover/rollback.sh` 增加 `# DEPRECATED: D+14 后不应使用` 注释
        （仍保留脚本本身备查）
  - [ ] OnCall 巡检节奏从"每天 4 次"恢复"工作日 1 次"
  - [ ] 临时收紧的告警阈值已恢复（A1 / A4，见 W6.B §2.1）

### 7.2 D+21 — 删 legacy 代码

  - [ ] 确认 `frontend/src/legacy/` 路径下所有文件 30 天未被任何路由 / import 命中
        （`rg "from .*legacy/" src/` should 返回 0）
  - [ ] `git rm -r frontend/src/legacy/`，PR 走完整 review（不走 fast-track）
  - [ ] 删除 `Makefile` 中 `test-regression-platform-*` 中对 legacy spec 的引用
        （现在仍指向 `frontend/src/pages/*.test.tsx`）
  - [ ] 关闭历史分支上未合 PR（>30 天 inactive）；通知作者
  - [ ] 更新 `frontend/.eslintrc.cjs` 移除 `src/legacy/` 例外规则（如有）
  - [ ] 更新 `CLAUDE.md` / `AGENTS.md`：去掉"legacy / v2 双轨"段落

### 7.3 D+28 — 删 demo / 归档

  - [ ] `git rm -rf tmp/platform-redesign/`、`tmp/ontology-workbench-redesign/`
  - [ ] 把 demo 截图（`uiv2.pen` 等）归档进
        `docs/superpowers/plans/2026-04-20-platform-redesign/archive/`
  - [ ] `docs/superpowers/plans/2026-04-20-platform-redesign/` 整体 README
        加状态徽章 `[ARCHIVED · v2 LIVE]`
  - [ ] Round 4 backlog 评审：把 §4.1 / §4.2 / §4.3 / §4.4 切成具体 ticket

### 7.4 每月（D+30 起）

  - [ ] 检查 `LEGACY_REDIRECTS` 表命中率：6 个月内删除零命中条目
  - [ ] 检查 `observability-events.yaml` 是否新增事件未登记
  - [ ] 检查 bundle gzip 是否在 350K 之内（CI 守门，但每月人工核一次趋势）
  - [ ] 检查 a11y 关键页是否仍 0 严重违规

---

## 8. 致谢

  本次 Round 3 cutover 由 16 路 sub-agent 与主线协同完成。
  每路 sub-agent 的产出与决策都记录在对应 `round*-execution-report.md` /
  `round3-w*-record.md`，可追溯。

  **关键决策回顾**（按重要性排序）：

  1. **full-replace-fast over feature-flag**（W1）—— 减少双轨维护，强制冻结质量门禁。
  2. **vendor-agnostic observability**（W5.E）—— `events.yaml` 是平台契约，
     不锁死 Sentry / Datadog。
  3. **token-based design system**（W4.B）—— stylelint 守门确保 Round 4 视觉精修
     可"换皮不换骨"。
  4. **e2e-v2 三套件分层**（W4.C / W5.C / W5.F / W6.A）——
     happy path / a11y / visual / smoke 各司其职，CI 上跑全 < 60 s。
  5. **集成测试 SQLite vs PostgreSQL 兼容性**（W5.B）——
     `BigInteger().with_variant(Integer(), "sqlite")` 解锁 in-memory 测试。
     这个 trick 应该写进 `AGENTS.md`，避免下个 sprint 的人重新踩坑。

---

## 9. Round 4 输入

  把本文件 §4 + §7 + §8 §5 作为 Round 4 启动会输入。
  Round 4 主题候选（不在本报告范围内决策）：

  - **A**：视觉精修 + a11y 收口（color-contrast / motion 偏好 / 高对比度模式）。
  - **B**：P04 / P17 缺口决策 + 实施。
  - **C**：用户偏好系统扩展（暗黑 / 紧凑 / 默认落地页 / 个性化 nav）。
  - **D**：后端 9 项拓展（B-back-10+）。

  上述候选由 Round 4 主持人在启动会确定优先级。
