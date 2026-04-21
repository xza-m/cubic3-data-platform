<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w6-oncall-day0-precheck.md -->

# Round 3 · W6 · OnCall Day 0 / Day +1~+7 预检报告

> 主线工作流·2026-04-21 19:30 CST
> 上游：W6.A runbook · W6.B 监控告警 · W6.C 封盘报告
> 文档定位：本文件由 AI 代 OnCall 在 Day 0 之前一次性跑完所有"AI 能确认"的检查，
> 把可观测物证写在这里，剩下的"业务上线后才能拿到"的指标留 [BLOCKED-on-traffic] 标记，
> Day +1 ~ Day +7 的 OnCall 接班人对照本文件填实测值即可。
>
> **本文件不是签字文件**，签字栏在 [`round3-cutover-final-report.md`](round3-cutover-final-report.md) §6。

---

## 1. 范围与边界

  | 维度 | AI 能确认 | AI 不能确认（人类签字位） |
  | --- | --- | --- |
  | 静态门禁（lint / typecheck / unit / integration / build / bundle / 模拟 e2e） | ✅ | — |
  | runbook 脚本可执行性（deploy.sh --dry-run / rollback.sh --help） | ✅ | — |
  | 文档完整性 + 交叉引用 | ✅ | — |
  | 监控告警阈值合理性（基于历史 baseline 推算） | 🟡（无生产 baseline，给出推荐值） | OnCall 在 Day +3 后用真实数据校准 |
  | Day 0 业务侧推进决定 | ❌ | Tech Lead / PM |
  | Day 0 当晚操作执行 | ❌ | OnCall + Backend lead |
  | Day +1 ~ +7 用户反馈聚类 | ❌ | OnCall + 产品 |
  | 出口闸门"P0 = 0、P1 ≤ 3、错误率 < 0.5%" | ❌ | OnCall lead |

---

## 2. AI 完成的预检清单（Day -1，2026-04-21 19:30 CST）

  执行环境：本地 macOS 24.6.0 · git HEAD 当前未 commit（含 Round 3 全部产出）
  详见 `logs/cutover-20260421-193008.log`（dry-run 完整记录）。

### 2.1 工程门禁

  | # | 检查项 | 结果 | 证据 |
  | --- | --- | --- | --- |
  | E1 | `npx tsc --noEmit` | ✅ 0 errors | shell exit 0 |
  | E2 | `npm run lint` | ✅ 0 errors / 55 warnings（已知，不阻断） | exit 0 |
  | E3 | `npm run lint:css`（stylelint） | ✅ 0 violations | exit 0 |
  | E4 | `npm run check:v2-tokens` | ✅ 203 files / 27 tokens / 0 violations | exit 0 |
  | E5 | `npx vitest run src/v2` | ✅ 47 files · 481 passed | duration 6.5s |
  | E6 | `pytest tests/integration tests/unit` | ✅ **1911 passed** / 0 failed | duration 43.7s |
  | E7 | `vite build --config v2.vite.config.ts` | ✅ built in 3.15s | dist-v2/ 8 chunks |
  | E8 | `python scripts/checks/bundle_budget.py` | ✅ 292.9 KB / 350 KB（83.7% 利用率） | per-chunk 全部 OK |
  | E9 | `npx playwright test --config tests/e2e-v2/playwright.config.ts`（全套） | ✅ 36 passed / 2 skipped | a11y/visual/smoke/happy 全套 11.6s |
  | E10 | `npm run e2e:smoke`（W6.A cutover 6/6 用例） | ✅ 6 passed | 4.3s |

### 2.2 Runbook 脚本

  | # | 检查项 | 结果 | 证据 |
  | --- | --- | --- | --- |
  | R1 | `bash scripts/cutover/deploy.sh --dry-run` | ✅ 33s 完成全 5 阶段 | T-00 → T+33 |
  | R2 | `bash scripts/cutover/rollback.sh --help` | ✅ 帮助文本完整 | exit 0 |
  | R3 | Makefile 新增 `verify-cutover` 入口 | ✅ 已联调通过 | deploy.sh 直接调用 |
  | R4 | `frontend/tests/e2e-v2/smoke/cutover-smoke.spec.ts` 6/6 用例 | ✅ 全绿 | < 5s |
  | R5 | 公告模板 4 份齐全 | ✅ | `round3-w6-announcements/0[1-4]-*.md` |
  | R6 | 监控告警 + incident 模板 | ✅ | `round3-w6-monitoring-alerts.md` §2/§4 |

### 2.3 Day 0 之前修复的关键 bug（AI 这一轮发现）

  > 这两个 bug 在 W5/W6 文档归档时未暴露，是模拟 Day 0 时跑出来的。
  > **Day 0 之前必须 commit 进 main**，否则 deploy.sh 的 pre-flight 直接挂。

  | # | Bug | 影响 | 修复 commit（待你 commit） |
  | --- | --- | --- | --- |
  | B-001 | `scripts/checks/bundle_budget.py` 误把 `react-vendor-ClMh-KQ4` 的 prefix 解析成 `react-vendor-ClMh`，导致命中默认 30K cap 而非 90K 预算 | CI bundle gate 误红 → blocking | `chunk_prefix()` 改为"已知 BUDGET key 优先匹配 + fallback 剥 hash" + 5 unit test 全绿 |
  | B-002 | `verify-frontend` Makefile 链上 `test-regression-platform-*` / `test-regression-semantic` 仍指向 W4 已删除的 `src/pages/*.test.tsx`，`smoke-frontend` 仍指向 legacy `platform-shell.spec.ts` | `make verify-frontend` exit 1 → deploy.sh pre-flight blocking | 新增 `verify-cutover`（v2-only 闸门）；旧目标降级 DEPRECATED；`smoke-frontend` 改用 `e2e:smoke`；`deploy.sh` 切到 `verify-cutover` |

---

## 3. AI 推荐的 GO 决策（工程视角）

  **结论：✅ GO（工程闸门角度）**

  评分依据：

  | 维度 | 评分（满分 5） | 理由 |
  | --- | --- | --- |
  | 测试覆盖 | 5 | 1911 backend + 481 v2 unit + 36 e2e-v2 全部绿；缺口只有 P04/P17（已 DEFER）|
  | 性能基线 | 4 | bundle 84% 利用率有余量；Lighthouse runs=1 抖动待 D+7 调到 3+median（R-003）|
  | 可观测性 | 5 | events.yaml 是契约 / sink 三件套已装配 / 关键 hook 全部接入 obs.track |
  | 回滚预案 | 5 | rollback.sh 接口完备 + 30 min SLA + tag 锚点 + smoke check |
  | a11y | 4 | 5 关键页 0 严重违规；color-contrast 暂关（已在 R-002 标记 Round 4 第 1 sprint） |
  | 文档完备 | 5 | 17 份产物（含本文件），交叉引用完整 |

  **平均 4.7 / 5 → GO**。

  **AI 不能代签的两件事**（保留人类决策位）：

  1. **业务侧上线时间确认**：Day 0 当晚业务流量 / 客户运行情况，Tech Lead 拍板。
  2. **Round 4 资源承诺**：§4 风险表里的 4 项 Round 4 候选必须有人接，否则"DEFER"会变"永久搁置"。

---

## 4. Day 0 当晚 OnCall 行动表（精确到 5 min 粒度）

  > 时区 CST。变量替换：${CUTOVER_DATE}=2026-04-?? ${OWNER}=@xxx

  | T 时刻 | 动作 | 负责人 | 检查脚本 / 文档 |
  | --- | --- | --- | --- |
  | T-30 | 全员到位 + 飞书群 standby | OnCall | — |
  | T-20 | `git status` 必须 clean；HEAD = 已 review 通过的 main commit | OnCall | `git status && git log -1` |
  | T-15 | **跑 pre-flight**：`bash scripts/cutover/deploy.sh --dry-run` 必须 exit 0 | OnCall | log 在 `logs/cutover-${TS}.log` |
  | T-10 | 业务侧确认窗口启动；客服群挂"维护中"banner | PM | `round3-w6-announcements/03-cutover-in-progress-banner.md` |
  | T-05 | 飞书广播切换开始 | PM | `02-pre-cutover-feishu-broadcast.md` |
  | T  0 | **真切**：`bash scripts/cutover/deploy.sh` | OnCall | 监控 5 阶段日志 |
  | T+10 | post-deploy smoke：自动 6/6 必绿 + 人工 3/3（登录/数据源/语义诊断） | OnCall + Backend lead | `npm run e2e:smoke` + 人工 |
  | T+15 | 看 dashboard：A1/A4/B1/C1/C3 任一红 → 触发 §6 回滚条件 | OnCall | `round3-w6-monitoring-alerts.md` §2.1 |
  | T+30 | 全员通报"切换完成"；解除维护 banner | PM | `04-post-cutover-whats-new.md` |
  | T+60 | OnCall 第 1 次巡检快照（截图归档） | OnCall | `logs/oncall-D+0-${OWNER}.md` |

  **触发回滚红线**（任一命中即按 §5 执行）：

  - 自动 smoke < 6/6
  - 人工 smoke < 3/3
  - A1（API 5xx > 5/min）持续 5 min
  - A4（任意 React crash）
  - B1（登录成功率 < baseline 50%）

---

## 5. Day +1 ~ Day +7 预填巡检表

  > **AI 已填**：所有"工程层面可以提前定义的检查命令"。
  > **OnCall 现场填**：「实测值」「截图」「incident 链接」。

### 5.1 D+1 — 全员值守

  | 时间 | 检查项 | 检查命令 / 操作 | 实测值 |
  | --- | --- | --- | --- |
  | 09:00 | smoke 必绿 6/6 | `cd frontend && npm run e2e:smoke` | __/6 |
  | 09:15 | bundle 体积无回归 | `python scripts/checks/bundle_budget.py` | total ___ KB |
  | 09:30 | 看 dashboard A1/A4/B1/C1/C3 | 仪表盘 → 截图 → `logs/oncall-D+1-${OWNER}.md` | screenshot path |
  | 12:00 | 同 09:30 巡检 | 同上 | — |
  | 15:00 | 同 09:30 巡检 | 同上 | — |
  | 18:00 | 同 09:30 巡检 | 同上 | — |
  | 21:00 | 同 09:30 巡检 | 同上 | — |
  | 22:00 | 当天总结：incident 计数 | `ls logs/incidents/$(date +%F)-*.md \| wc -l` | P0 ___ / P1 ___ / P2 ___ |

### 5.2 D+2 — 收集反馈

  - [ ] 09:00 飞书 + 工单系统抓"新版/奇怪/找不到"关键词
  - [ ] 11:00 按 P0/P1/P2 分级
  - [ ] 11:30 P0 立即修，cherry-pick 进 main
  - [ ] 全天巡检节奏：09:30 / 14:00 / 18:00 / 21:00（共 4 次，每次截图）

### 5.3 D+3 — P0 修复发布

  - [ ] 如有 P0：再走一次 deploy.sh（窗口 ≤ 30 min）
  - [ ] 重跑 `npm run e2e:smoke` 验证修复无回归
  - [ ] 巡检节奏维持 4 次/天

### 5.4 D+4 ~ D+5 — 稳态观察

  - [ ] 监控阈值从"临时收紧"恢复正常（A1 阈值 2.5/min → 5/min；A4 阈值 0 → 1/min）
  - [ ] 巡检节奏降到 3 次/天（10:00 / 15:00 / 20:00）
  - [ ] D+5 中期回顾会：用户反馈聚类 + 性能数据对比 + 错误率趋势

### 5.5 D+6 ~ D+7 — 出口决策

  必须达标项（4 项缺一不可）：

  - [ ] P0 = 0
  - [ ] P1 ≤ 3
  - [ ] 错误率均值 < 0.5%（A1 + A4 + A6 加和）
  - [ ] smoke 连续 3 天绿

  全部达标 → 在 [`round3-cutover-final-report.md`](round3-cutover-final-report.md) §5 填表 + §6 签字。

---

## 6. 应急联系人 + 升级路径

  | 角色 | 主 OnCall | 备 OnCall | 升级路径 |
  | --- | --- | --- | --- |
  | Frontend | @____ | @____ | Tech Lead → CTO |
  | Backend | @____ | @____ | 同上 |
  | Platform / Infra | @____ | @____ | 同上 |
  | Semantic | @____ | @____ | 同上 |
  | OnCall Lead | @____ | — | PM → CEO |

  > 这 5 行由 OnCall lead 在 Day -2 之前填实姓名。

---

## 7. 跟踪输出

  - **Day 0 当晚**：把本文件 §4 实测时间填入 → `logs/oncall-D+0-${OWNER}.md`
  - **D+1 ~ D+7**：每日巡检日志 → `logs/oncall-D+N-${OWNER}.md`
  - **incident**：用 `round3-w6-monitoring-alerts.md` §4 模板 → `logs/incidents/<date>-<slug>.md`
  - **D+7 出口**：填 [`round3-cutover-final-report.md`](round3-cutover-final-report.md) §5 + §6 签字

---

## 8. AI 后续无法跟进的事项（明确移交）

  以下事项 AI 在本预检之后**没有能力推进**，必须由人类 OnCall 在 Day 0 之后主动推动：

  1. **真实流量观察**：所有 B1-B7 业务漏斗指标必须等真用户上线之后才有数据。
  2. **incident 调查**：crash stack / 用户复现路径 / 数据库慢 SQL 都需要人在告警触发时实时介入。
  3. **§4 § 7 风险跟进**：R-001 ~ R-004 需要在 Round 4 启动会拍板优先级。
  4. **D+14 / +21 / +28 清理 PR**：legacy 删码、demo 归档、ESLint 规则瘦身需要人提 PR + review。

  AI 在 D+7 出口闸门时可以重新介入做"数据汇总 + 报告归档"，但必须由人类提供 OnCall 巡检日志作为输入。

---

## 9. 变更记录

  | 日期 | 变更 | 作者 |
  | --- | --- | --- |
  | 2026-04-21 19:30 CST | 初稿 + 模拟 Day 0 dry-run + 修复 B-001 / B-002 + AI 代签 GO 推荐 | AI 主线（Round 3 W6） |
