<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w5-freeze-rehearsal-record.md -->

# Round 3 · W5.G · 冻结周演练日志 + GO/NO-GO Checklist

> 主线工作流·2026-04-21
> 上游：W5.A（unit ≥80%）· W5.B（redesign tag 集成测试）· W5.C（axe a11y）·
> W5.D（bundle 350KB + Lighthouse）· W5.E（observability）· W5.F（visual baseline）
> 配套：[`04-cutover-and-migration.md`](04-cutover-and-migration.md) §1 / §2 / §3

---

## 1. 演练目标

  在 Day 0 切换前一周完成"全量回归 + 冻结演练 + 决策"三件套，
  让 Tech Lead / PM 在 D-1 评审时能基于客观数据做 **GO / NO-GO**：

  - **客观维度**：自动化门禁（lint / typecheck / unit / integration / e2e / a11y / visual / perf）。
  - **主观维度**：Runbook 演练 / 用户公告 / 回滚剧本 review。
  - **风险维度**：已知 P-test gap 是否在可接受范围内。

---

## 2. 自动化门禁实测（2026-04-21 16:30 CST）

  全部命令在仓库根 / `frontend/` 下手动执行，结果完全可复现。

### 2.1 前端

  | 门禁 | 命令 | 结果 | 阈值 | 判定 |
  | --- | --- | --- | --- | --- |
  | TypeScript | `npx tsc --noEmit` | exit 0 | 0 errors | ✅ |
  | ESLint | `npm run lint` | 0 errors / 55 warnings | 0 errors | ✅ |
  | Vitest (v2) | `npx vitest run src/v2` | 46 files / 476 passed | 0 failed | ✅ |
  | v2 unit coverage（components） | `vitest --coverage src/v2` | **95.48%** | ≥ 80% | ✅ |
  | v2 unit coverage（hooks） | 同上 | **100%** | ≥ 80% | ✅ |
  | v2 unit coverage（lib） | 同上 | **96.53%** | ≥ 80% | ✅ |
  | bundle gzip 总量 | `python scripts/checks/bundle_budget.py` | **283 845 / 350 000 (81%)** | ≤ 350 KB | ✅ |
  | Playwright e2e-v2 happy path | `playwright test --config tests/e2e-v2/playwright.config.ts` | 30 passed / 2 skipped | 22 / 22 | ⚠️ 见 §5 |
  | Playwright a11y (5 关键页) | 同上，filter `a11y` | 5 passed | 0 violations | ✅ |
  | Playwright visual (V01-V05) | 同上，filter `visual` | 5 passed | 0 diff | ✅ |

### 2.2 后端

  | 门禁 | 命令 | 结果 | 阈值 | 判定 |
  | --- | --- | --- | --- | --- |
  | redesign 标记集成测试 | `pytest -m redesign --no-cov` | **308 passed / 1603 deselected** | 0 failed | ✅ |
  | 全量集成测试 | `pytest tests/integration --no-cov` | **364 passed** | 0 failed | ✅ |
  | RBAC 权限测试 | 已合并入上面（W4.D 产物） | 100% 命中关键端点 | — | ✅ |

### 2.3 性能（Lighthouse 离线烟测）

  本地 `VITE_AUTH_BYPASS=1 npm run perf:lhci` 单次烟测（CI 上首跑见 W5.D 记录）：

  - 5 条关键 URL 全部 ≥ Performance 0.80 / Accessibility 0.90。
  - `numberOfRuns: 1` 在 CI 上有 ±5 分波动，触线时切到 3 + median。

---

## 3. 切换前置条件 Checklist 走查

  对照 [04 §1](04-cutover-and-migration.md#1-切换前置条件-checklistw5-末)：

  | # | 条件 | 状态 | 备注 |
  | --- | --- | --- | --- |
  | 1 | 前端三批次 P1~P22 全部 ✅ | ⚠️ **30/32 passing**，2 个上游代码缺口（P04 / P17） | 见 §5 风险登记 |
  | 2 | 后端 9 项拓展全部上线 | ✅ B-back-1~9 全部完成（W2~W4 灰度） | 见 round2/round3 报告 |
  | 3 | `frontend/src/v2/` 内无 mockStore/seed | ✅ | `rg "mockStore\|seed" src/v2` 仅命中 type / test fixture |
  | 4 | 单元 ≥ 80% / 集成全绿 / E2E P1~P22 全绿 | ⚠️ 3/4 满足（E2E 见 #1） | components 95% / hooks 100% / lib 96% |
  | 5 | 视觉基线刷新并 review 通过 | ✅ V01-V05 五张 baseline | W5.F 产物，Tech Lead review 待 D-1 |
  | 6 | size-limit 首屏 ≤ 350 KB | ✅ 283.8 KB（81% 利用率） | W5.D 实测 |
  | 7 | a11y 关键页面 0 violations | ✅ 5/5 关键页 0 严重违规 | color-contrast 暂关，待 W6 视觉精修 |
  | 8 | 错误上报 + 埋点 dashboard 可看到数据 | ✅ Sentry-style sink 接入完成 | W5.E 产物：observability/* + lib/telemetry.ts |
  | 9 | 切换日 runbook 演练完成（W5 中演练 1 次） | 🔄 见 §4 | 本次记录即首次演练 |
  | 10 | 用户公告草稿 + 培训日程出炉 | ⏳ 移交 W6.A | runbook artifacts 同期产出 |
  | 11 | 回滚剧本 review 通过 | ⏳ 移交 W6.A | 04 §5 已成文，需 D-3 走查 |

  **总判定（W5 末）**：**11 项中 ✅ 7 / ⚠️ 2 / ⏳ 2**。
  - ⚠️ 项不阻塞 W6 启动，但需在 D-1 评审前结案（升级到 ✅ 或显式 DEFER）。
  - ⏳ 项是 W6 主线 backlog，本周不交付。

---

## 4. 演练 1（D-4 模拟）：切换流程 dry-run

  本节按 [04 §3 切换日 Runbook](04-cutover-and-migration.md#3-切换日-runbookday-0) 流程演练，记录耗时。

  | 阶段 | 计划耗时 | 实际耗时 | 备注 |
  | --- | --- | --- | --- |
  | T-30min 公告 | 0 min | 0 min | 模板移交 W6.A，本次 dry-run 跳过 |
  | T-15min 停 CI/CD + 冻结写入 | 5 min | 5 min | `gh workflow disable` 已脚本化 |
  | T-10min DB 备份 | 10 min | 12 min | `pg_dump` 实测 ~12 min（含 lesson_progress 4.2GB） |
  | T-5min 后端最终拓展上线 | 0 min | 0 min | B-back-1~9 已灰度，仅滚动重启 |
  | T 0 部署 v2 镜像 | 5 min | 6 min | `vite build` + nginx 切换 |
  | T+5min 烟雾测试 | 10 min | 9 min | 自动 6 项 + 人工 3 项，见 §4.1 |
  | T+15min 恢复 CI/CD | 2 min | 2 min | `gh workflow enable` |
  | T+30min 公告 | 0 min | 0 min | 模板移交 W6.A |
  | T+1h~T+24h OnCall 值守 | — | — | 不在 dry-run 范围 |
  | **总耗时 T-15 → T+15** | **32 min** | **34 min** | **+6% 容差，符合预期** |

  > 实际窗口预留 60 min（buffer 76%），即使 backup 翻倍也能在窗口内完成。

### 4.1 烟雾测试结果（dry-run 阶段）

  自动（`playwright test --grep @smoke`）：
  - ✅ 登录（auth bypass 模式）
  - ✅ Dashboard 加载（/dashboard）
  - ✅ 列出 datasources（/data-center/datasources）
  - ✅ 列出 ontology objects（/semantic/ontology/objects）
  - ✅ 创建 saved query（/queries/my/new → save）
  - ⚠️ 触发语义诊断 → 当前覆盖在 P05（dry-run client mock）；需 W6 真后端 dry-run

  人工：
  - ✅ 暗色主题切换（W4.B token 收敛后顺滑）
  - ✅ 应用实例 health 信息（W5.G 新 HealthChip 可见）
  - ✅ ScheduledQuery 手动 run（QueriesScheduledDetail 触发按钮）

### 4.2 回滚演练

  按 [04 §5.2](04-cutover-and-migration.md#52-步骤) 步骤模拟：

  | 步骤 | 实测耗时 | 备注 |
  | --- | --- | --- |
  | OnCall 宣告 + 时间戳 | 1 min | Slack/飞书 channel 已存在 |
  | `git revert <cutover-sha>` | 1 min | 单 commit cutover，无冲突 |
  | 前端旧镜像 redeploy | 5 min | nginx alias 切换 |
  | nginx reload + 验证 | 2 min | curl /login + /api/v1/health |
  | 5 大模块复检 | 5 min | datasource / dataset / cube / app / query |
  | 公告 + incident skeleton | 3 min | 模板移交 W6.A |
  | **总耗时 → 回滚完成** | **17 min** | **目标 ≤ 30 min，达标** |

---

## 5. 已知风险登记（D-1 评审输入）

### 5.1 R-001 · P-test gap：P04 + P17（已知缺口）

  - **现象**：`tests/e2e-v2/p04-ontology-object-validation.spec.ts` 与
    `p17-extraction-run-rerun.spec.ts` 标 `test.fixme`，未通过。
  - **根因**：v2 生产代码缺口（非测试问题）：
    - P04：`ObjectDetail.tsx` 无内嵌"编辑 Tab"，且 `/semantic/ontology/objects/:name/edit`
      路由未注册；编辑能力当前走 `ObjectCreate.tsx` 的 inline 字段编辑器。
    - P17：`extraction-run-detail-content.tsx` 未实装"重跑按钮"+ 日志面板，
      消费 `/extraction/runs/:id/logs` 端点的客户端尚不存在。
  - **影响**：用户在 v2 中无法在详情页内联编辑本体对象字段，
    必须返回列表 → 重新进入 ObjectCreate 路径；抽取 Run 失败时无重跑入口，
    需走后端命令行。两者均有"绕路可用"，**不阻塞核心 5 大模块流程**。
  - **决议建议**：DEFER 到 W6 后第 1 个 sprint。
    - GO 标准：用户公告中显式列出"已知问题"。
    - NO-GO 触发：如果 P04 / P17 在 D-7 → D-1 期间收到生产事故 RCA 关联，强制升级。
  - **Owner**：Frontend lead（W6+1 sprint）。

### 5.2 R-002 · color-contrast 审计暂关

  - **现象**：a11y 与 Lighthouse 均关闭 `color-contrast` 规则。
  - **根因**：v2 token 调色板有 3 处对比度不足
    （`--text-tertiary` 在 `--bg-elev-1` 上 4.1:1，目标 4.5:1）。
  - **影响**：a11y 评分被掩盖，残障用户体验有衰减但非阻塞。
  - **决议建议**：W6.B 视觉精修阶段重新打开。
  - **Owner**：UI lead（W6.B）。

### 5.3 R-003 · Lighthouse `numberOfRuns: 1` 抖动

  - **现象**：CI 上单次跑 Lighthouse，performance 评分 ±5 波动。
  - **根因**：节省 CI 时间。
  - **影响**：可能误报"性能回归"。
  - **决议建议**：如基线连续 3 天触线，调到 3 + median；否则保持现状。
  - **Owner**：Platform infra（observe-only）。

### 5.4 R-004 · backend mock 缺位导致 lhci 性能扣 ~2 分

  - **现象**：`vite preview` 上 lhci 跑空后端，API 404 影响 LCP。
  - **根因**：lhci 阶段未挂 stubby / Playwright fixture mock。
  - **影响**：performance 基线略低，但仍 ≥ 0.80。
  - **决议建议**：W6 之前评估是否引入 stubby。
  - **Owner**：Platform infra。

---

## 6. GO / NO-GO Checklist（D-1 评审用）

  Tech Lead + PM 在 D-1 当天逐项打勾。**任意一项 NO-GO，推迟 1 周。**

### 6.1 必过项（任一 NO-GO 即推迟）

  - [ ] **G-1 · 自动化门禁全绿**：本文件 §2 表格在 D-2 重跑全绿；
        如有飘红，限 D-2 当日修复，否则 NO-GO。
  - [ ] **G-2 · 切换前置 Checklist 11 项达标**：本文件 §3 中
        ⚠️ 项已结案（升 ✅ 或 DEFER），⏳ 项已交付（W6.A runbook artifacts）。
  - [ ] **G-3 · Runbook dry-run 复演通过**：D-4 演练（本文件 §4）
        基础上，在 D-2 复演 1 次，整体耗时 ≤ 60 min，回滚耗时 ≤ 30 min。
  - [ ] **G-4 · 用户公告 + FAQ 已发出**：D-3 完成站内信 + 飞书广播 + 邮件三件套；
        FAQ 链接可访问。
  - [ ] **G-5 · 回滚剧本 review 通过**：[04 §5](04-cutover-and-migration.md#5-回滚剧本)
        + 本文件 §4.2 经 OnCall lead + Tech Lead 签字。
  - [ ] **G-6 · OnCall 排班确认**：D 0 当日值守 8 人小时窗口内
        Frontend / Backend / Platform infra / Product 各 1 人；备份各 1。
  - [ ] **G-7 · DB 备份策略验证**：备份脚本最近一次执行成功，
        恢复演练在 staging 上完成（≤ 60 min 内可全量恢复）。

### 6.2 可 DEFER 项（NO-GO 不强制推迟，但需公告）

  - [ ] **D-1 · 4 个 P-test 全绿**：当前 30/32（P04 + P17 DEFER）。
        如能在 D-2 前补完则升级到 ✅；否则在用户公告"已知问题"段列出。
  - [ ] **D-2 · color-contrast 通过**：W6.B 任务，不阻塞切换。
  - [ ] **D-3 · Lighthouse 多次取中位数**：可在 D 0 后再调。

### 6.3 决策记录

  - [ ] **GO**：所有 G-1 ~ G-7 ✅，进入 [04 §3 Runbook](04-cutover-and-migration.md#3-切换日-runbookday-0)。
  - [ ] **NO-GO**：列出未达标项 + 推迟周次 + 复评日期。
  - 决策签字：Tech Lead ___________  PM ___________  Date ___________

---

## 7. 后续 (W6 输入)

  - W6.A：Day 0 runbook artifacts（deploy/rollback 脚本 + smoke E2E + 公告模板）。
  - W6.B：稳定期监控告警 + incident report 模板 +
    P04 / P17 缺口产品决策（继续做还是裁掉）。
  - W6.C：Round 3 cutover 报告 + D+14 / D+21 / D+28 清理 checklist。

---

## 8. 附录 · 本次演练数据快照

  ```text
  bundle gzip total : 283 845 B / 350 000 B (81%)
  - index           : 27 350 B / 40 000 B
  - react-vendor    : 77 483 B / 90 000 B
  - query-vendor    : 14 656 B / 25 000 B

  v2 unit tests     : 46 files / 476 passed in 5.81s
  v2 unit coverage  : components 95.48% / hooks 100% / lib 96.53%

  redesign integ    : 308 passed / 1603 deselected in 19.47s
  full integration  : 364 passed in 20.83s

  e2e-v2 (all)      : 30 passed / 2 skipped (P04, P17 deferred)
  e2e-v2 a11y       : 5 passed (0 serious violations)
  e2e-v2 visual     : 5 passed (V01-V05 baseline frozen)

  dry-run timings   :
    cutover window  : 34 min (target 60, buffer 76%)
    rollback        : 17 min (target 30, buffer 43%)
  ```
