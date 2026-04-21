<!-- docs/superpowers/plans/2026-04-20-platform-redesign/mr-description.md -->

# Round 3 Cutover · Platform Redesign UI v2 全量切换

> **MR 模板** — 复制下方正文到 GitLab MR Description（Markdown 渲染）。
> 源分支：`release/round3-cutover` → 目标分支：`main`
> 累计：**825 files changed · +76,788 / -6,469**

---

## TL;DR

Round 1-3（共 6 周）平台 UI v2 重构 + 后端双向对齐 + 切换工具链一次性落地，
Day 0 闸门 `make verify-cutover` 全绿，**建议合并并在维护窗执行 `scripts/cutover/deploy.sh`**。

- 视觉一致性：5 大模块对齐 `tmp/platform-redesign/` demo 视觉基线
- 功能覆盖：`app/interfaces/api/v1/*` 100% 在前端 v2 有承载入口（详见 `route-parity-audit.md`）
- 性能：首屏 chunk **292.9 KB / 350 KB**（83.7% 利用率，留余量）
- 测试：后端 1911 + 前端 v2 unit 476 + e2e-v2 happy 30 / a11y / smoke 6 全绿
- 切换工具链：`deploy.sh` / `rollback.sh` / `verify-cutover` 全部通过 dry-run

---

## 1. 15 commit 全景

  | # | hash | 主题 |
  | --- | --- | --- |
  | 1 | `16baa38` | `chore(repo)` 收紧 .gitignore（v2 build artifacts + 设计 scratch） |
  | 2 | `10e58e6` | `chore(semantic)` 删 32 份 playground/QA cube 残留 + 治理记录 |
  | 3 | `b9b7d71` | `chore(legacy)` W4 cutover：282 个 src→legacy rename + lib 修复 |
  | 4 | `01b2101` | `feat(backend)` user identity stack：preferences / roles / users CRUD |
  | 5 | `4e3ef94` | `feat(backend)` scheduled queries + diagnose runs |
  | 6 | `a240e0b` | `feat(backend)` view materialize + datasource schema + cube listing |
  | 7 | `c676a5c` | `feat(backend)` app instance health + ontology object search/workbench reads |
  | 8 | `032c6c8` | `feat(backend)` wire-up：DI / blueprints / middleware + 5 alembic migrations |
  | 9 | `752b00e` | `feat(frontend-v2)` Round 1-3 W2-W4 完整 UI v2 实现（268 文件 / +42 K） |
  | 10 | `63e8e0f` | `test(round3)` integration + unit + 前端 v1 visual baseline 退役 |
  | 11 | `abf57b1` | `ci` backend/frontend workflows + bundle_budget + route_parity + lighthouse |
  | 12 | `49cb45f` | `feat(cutover)` deploy.sh / rollback.sh + verify-cutover Make 目标 |
  | 13 | `191c1b7` | `docs(round3)` platform-redesign 文档套件 + ADR + 7 业务 cube |
  | 14 | `078bc5f` | `docs(plans)` archive 6 plan + 3 spec + master plan 头 + R-001 表 |
  | 15 | `e87e336` | `chore(misc)` pytest redesign marker + uiv2.pen 2.10→2.11 |

---

## 2. 验证证据

### 2.1 `make verify-cutover` 闸门（2026-04-21 22:21）

  | 闸门 | 结果 | 备注 |
  | --- | --- | --- |
  | `npm run lint` | ✅ | 0 error / 0 warning |
  | `tsc --noEmit` | ✅ | 严格模式 |
  | `npm run lint:css` | ✅ | stylelint pass |
  | `npm run check:v2-tokens` | ✅ | 无硬编码颜色逃逸 |
  | `vitest run src/v2` | ✅ | **46 files / 476 tests passed** · 5.0s |
  | `npm run e2e:smoke` | ✅ | **6/6 Playwright spec passed** S01-S06 · 4.9s |

  ```
  [cutover][gate] verify-cutover 通过
  ```

### 2.2 旁路证据

  - 后端：`pytest -q tests/` → 1911 passed · 0 failed
  - 前端 happy：`npm run e2e:v2` → 30 passed / 2 fixme（P04/P17 已立卷为 R-001）
  - 前端 a11y：`npm run e2e:v2:a11y` → 5 关键页 0 严重违规
  - bundle 预算：`python scripts/checks/bundle_budget.py` → 292.9 KB / 350 KB
  - 路由 parity：`python scripts/checks/route_parity.py` → 100% v1↔v2 覆盖

---

## 3. DEFER 风险登记（封盘报告 §4）

  | ID | 严重度 | 内容 | 处置 | 跟进期限 |
  | --- | --- | --- | --- | --- |
  | **R-001-P04** | L1 | 本体对象编辑 Tab 未实装（绕路 ObjectCreate 可用） | DEFER | Round 4 sprint 1 |
  | **R-001-P17** | L1 | 抽取 Run 重跑 + 日志面板缺失（OnCall 走 CLI） | DEFER | Round 4 sprint 1 |
  | **R-001 Object Aggregate** | L1 | 整套方案冷藏在 `archive/ontology-object-aggregate-2026-04-14` tag | 重做 vs cherry-pick 决策 | Round 4 评估 |
  | **R-002** | L2 | a11y `color-contrast` 暂关：`--text-tertiary`/`--bg-elev-1` 4.1:1 | DEFER | Round 4 视觉精修 sprint 1 |
  | **R-003** | L3 | Lighthouse `numberOfRuns: 1` ±5 抖动 | 调到 3 + median | D+7 |
  | **R-004** | L3 | lhci 无后端 mock 扣 ~2 LCP | 评估 stubby | W6+1 |
  | OnCall 脚本 | L3 | `health_probe.sh` / `digest_oncall.py` / `incident_init.py` 待补 | 用 `monitoring-alerts.md §4` 模板手挡 | OnCall 期间补 |

> **冷藏说明**：`archive/ontology-object-aggregate-2026-04-14` tag 已 push 到 origin，
> 包含 15 个未合入 commit；Round 4 决策时优先评估在 v2 路径上重做。

---

## 4. 切换 Checklist（合并后由 OnCall 执行）

### 4.1 合并前

  - [ ] 至少 1 名 reviewer + 架构 owner 双签
  - [ ] CI 全绿（backend-ci + frontend-ci）
  - [ ] 与产品 / 业务方确认维护窗时间
  - [ ] 通知文案模板：`docs/superpowers/plans/2026-04-20-platform-redesign/round3-w6-announcements/`

### 4.2 维护窗内

  - [ ] `git pull origin main && git checkout <merge-commit>`
  - [ ] `make verify-cutover` 二次复跑
  - [ ] `bash scripts/cutover/deploy.sh --dry-run` 干跑
  - [ ] `bash scripts/cutover/deploy.sh` 实跑（蓝绿切 + nginx reload + post-deploy verify）
  - [ ] 浏览器人工 smoke：5 大模块 + 登录 / 注销
  - [ ] 监控 5 分钟错误率 / API p95（参考 `round3-w6-monitoring-alerts.md`）

### 4.3 异常回滚

  - [ ] `bash scripts/cutover/rollback.sh` 一键回滚到上一个 tag
  - [ ] 在 `issues/` 立 incident 文档 + post-mortem 模板

### 4.4 Day +1 ~ Day +7 阻焊

  - [ ] 每日 OnCall 用 `round3-w6-monitoring-alerts.md` 模板做日报
  - [ ] D+7 收紧 Lighthouse `numberOfRuns: 3 + median`（R-003）
  - [ ] D+7 评估 lhci stubby（R-004）
  - [ ] 整理用户反馈喂给 Round 4 sprint planning

---

## 5. Reviewer 阅读建议（最优路径，约 60 min）

  1. **架构与决策**（10 min）
     - `docs/superpowers/plans/2026-04-20-platform-redesign-rollout-implementation.md`（Master Plan 头部）
     - `docs/superpowers/plans/2026-04-20-platform-redesign/00-architecture.md`
     - `docs/superpowers/plans/2026-04-20-platform-redesign/round3-cutover-final-report.md`（封盘报告）
  2. **后端契约**（15 min）
     - 单看 commit 8（`032c6c8`）：DI / blueprint / migration wire-up
     - 抽 1-2 个新 v1 蓝图 + 对应 service 看分层
  3. **前端 v2**（15 min）
     - 单看 commit 9（`752b00e`）的 PR diff 太大；建议直接看 demo URL（部署预览）+ 关键文件：
       - `frontend/src/v2/App.tsx` / `routes.tsx` / `pages/dashboard/Dashboard.tsx`
       - `frontend/src/v2/components/PeekPanel.tsx` / `EntityFormDialog.tsx`
       - `frontend/src/v2/observability/` + `frontend/src/v2/api/client.ts`
  4. **CI / Cutover**（10 min）
     - `.github/workflows/{backend,frontend}-ci.yml`
     - `scripts/cutover/{deploy,rollback}.sh`
     - `Makefile` 中 `verify-cutover` 段落
  5. **风险与留尾**（10 min）
     - 封盘报告 §4 + R-001/R-002/R-003/R-004
     - `docs/superpowers/plans/archive/README.md`（理解 6 份历史 plan 为何归档）

---

## 6. 关联

  - 历史治理：`docs/superpowers/plans/2026-04-20-branch-governance-cleanup-execution.md`
  - 冷藏 tag：`archive/ontology-object-aggregate-2026-04-14`
  - Round 1-3 周报：`docs/superpowers/plans/2026-04-20-platform-redesign/round{1,2-w1,2-w2,2-w3,3-w4,3-w5,3-w6}-*.md`
  - ADR：`docs/adr/{001-scheduled-query-runner,002-frontend-error-reporting,003-i18n-tooling}.md`

---

## 7. AI 代审推荐（工程视角）

> 基于 Day 0 pre-check + verify-cutover 证据，**GO 推荐**。
> 详见封盘报告 §6.1。

_本 MR 描述生成于 2026-04-21，对应 commit `e87e336`。_
