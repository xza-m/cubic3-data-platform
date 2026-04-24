# Round 3 收敛 · 设计备忘

## Context

Round 3 横跨 ~15 轮对话，涉及：
- 后端若干应用/基础设施修复（queries / datasets / channels / subscriptions / users / semantic / auth 等）
- 两张审计相关的数据库迁移（subscription_delivery_logs / audit_tables）
- 前端 v2 全量 API 契约对齐 + 多 page 联调修复
- 覆盖率规则重校准（后端 rules JSON 更新、前端 guard 从 Python 脚本迁到 frontend 自备 gate）
- E2E 从 legacy `tests/e2e-node/` 迁移到 v2 的 `tests/e2e-v2/`，并补齐 7 个 gap（p23~p29）
- 原型 `frontend/QueryBuilder.tsx` 归档并由 v2 `/queries/visual` 承接（同步执行，非异步导出）
- 本地 CI 闸门：新增 `.husky/pre-commit`（< 5s lint-staged）+ `.husky/pre-push`（< 90s `ci:pre-push`）

最后收敛成 3 个 commit：
| Commit    | 主题                               | 规模             |
|-----------|------------------------------------|------------------|
| `2bd4e2b` | 主线联调收敛                       | 86 files +3017/-1102 |
| `09892dd` | E2E 收敛                           | 26 files +1374/-1515 |
| `d389c20` | /queries/visual 承接 QueryBuilder  | 12 files +2178/-25   |

本 change 的 design.md 记录决策过程，作为 Round 4 kickoff 的上下文。

## Goals / Non-Goals

**Goals:**
- 把 3 个 commit 背后的"为什么"和"有哪些权衡"保留下来
- 为 follow-up change 提供起点（导出能力 / lint 清理 / E2E 加深）
- 明确 Round 3 的**边界** —— 做了什么 + 显式不做什么

**Non-Goals:**
- 重述代码层面 what：3 个 commit message 已足够详尽，本文档不复读
- 针对每个后端修复写专题：那些都是 tactical fix，没有 architectural 决策
- 描述 Round 1/2 的历史：它们各自有独立归档

## Decisions

### D1. 为什么 `/queries/visual` 承接 QueryBuilder 而非保留原型作为导出页

**Context**：`frontend/QueryBuilder.tsx` 是 FY25 遗留的 642 行原型，语义是"自助数据导出"（select 字段 → 配 filter → 异步导出到文件）。

**Alternatives**：
- A. 原样搬到 v2 作为 `/queries/export`
- B. 重新实现完整的异步导出（后端新 API + 任务队列 + 结果存储 + 下载 + 前端新页）
- C. **（选中）** 归档原型，把 `/queries/visual` 重塑为"可视化查询构建器"（生成 SQL → 同步执行或跳 QueryConsole 继续编辑）

**Rationale**：
- A 不可行：后端**没有** `/api/v1/queries/export`，原型调用的是一组从未实现的 endpoint
- B 工作量大：需要 ~1-2 天的后端 + 前端 + 存储层工作，Round 3 收敛阶段不适合开大口子
- C 复用 Round 3 已有的 `/api/v1/queries/execute` 同步执行能力，**立即可用**，并通过 sessionStorage 提供"跳 QueryConsole 继续编辑"的逃生通道；异步导出由 follow-up change `add-query-export` 完整承接

**Trade-off**：`/queries/visual` 目前只能查询小结果集（同步执行超时 = 整个 request 失败）；大数据量导出需要等 `add-query-export` 落地。Known gap，已在 banner 文档中说明。

### D2. 为什么把 Round 3 拆 3 个 commit 而不是 1 个大 commit

**Context**：Round 3 收尾时工作区累积了 97 file / +3272 / -2639 的改动，覆盖 3 个独立主题。

**Alternatives**：
- A. 1 个大 commit
- B. **（选中）** 3 个主题化 commit，各自可独立 revert
- C. N 个原子 commit（每个 file 独立）

**Rationale**：
- A 粒度过粗，bisect / revert 困难
- B 三个主题语义清晰：主线联调 / E2E 收敛 / QueryVisual 承接
- C 边际收益低，且时间投入高（~90+ commit）

**技术挑战**：`frontend/src/v2/routes.tsx` 既含 commit 1 的路由修复，又含 commit 3 的 QueryVisual 挂载 —— commit 1 先提时，`routes.tsx` 若包含 `import('@v2/pages/queries/visual/QueryVisual')`，会让 commit 1 的 `tsc --noEmit` 挂（QueryVisual 源文件还没入仓）。

**解决**：手工把 `routes.tsx` 里 QueryVisual 的两处改动先 revert 到 Placeholder 状态，commit 1 提完后再 StrReplace 加回，commit 3 统一提。i18n JSON 的 queryVisual.\* 41 个 key 归入 commit 1（预埋，不影响编译），避免三次 selective stage。

### D3. 为什么删除 `tests/e2e-node/` 而不是保留 alias

**Context**：v1 的 Playwright 套件（`tests/e2e-node/`）对应的页面在 v2 全部已由 `tests/e2e-v2/` 承接。

**Alternatives**：
- A. 保留 e2e-node，alias 跑 v2 配置
- B. **（选中）** 彻底删除 e2e-node + `frontend/playwright.config.ts`，`test:e2e` npm script 下线
- C. 临时标记 skipped，几个 sprint 后再清

**Rationale**：
- A 让两套 harness 长期共存，新人上手成本高
- B 一刀切，**前置条件是 7 个 gap 必须先补齐**（p23~p29）才能删；这正是 commit 2 的核心工作
- C 失去激励去补 gap

### D4. 为什么覆盖率 guard 从 `scripts/checks/frontend_coverage_guard.py` 迁到 frontend 自备 gate

**Context**：旧的 frontend coverage guard 是 Python 脚本，从 root `make` 调用，读 `scripts/frontend_coverage_rules.json`，离 frontend 代码远。

**Decision**：删除 Python guard，改由 `frontend/` 内部的 `scripts/check-v2-tokens.mjs` / `lint:all` / `i18n:coverage` 各司其职，从 `.husky/pre-push` 调用 `npm run ci:pre-push` 统一触发。

**Rationale**：gate 与被 gate 的代码位于同一 package，更符合 frontend tooling 的心智模型；pre-push < 90s 的闸门足以保证质量线。

## Risks / Trade-offs

- **[lint]** pre-commit 的 `--max-warnings=0` 仅对 staged 文件拦截，全量 lint 仍有 ~50+ pre-existing warnings（大多是 `react-refresh/only-export-components`） → follow-up change `lint-fast-refresh-cleanup` 跟进；本次 3 个"刚好被 staged 触及"的 warning 已顺手修掉
- **[导出能力缺失]** `/queries/visual` 只能同步执行，大数据量查询无导出通道 → follow-up change `add-query-export` 跟进
- **[E2E 深度不足]** p23~p30 全部是 smoke 级（挂载 + 1~2 交互），实际用户操作回路未被回归 → follow-up change `e2e-interaction-paths` 跟进
- **[历史 commit 不可再变]** 已 push 到 `origin/main`；如归档文档与 commit 叙事出入，以 commit message 为准

## Migration Plan

不涉及。本 change 是事后归档，不改代码。

## Open Questions

- 是否要在 `.planning/codebase/` 里新增 `ROUND_3_RETRO.md` 做更轻量的总结？当前决策是 openspec archive 已经足够；若团队 retro 会议需要，可以从本文档派生。
- Round 4 的 T-0 是什么？当前建议按 risk 栏的顺序 propose follow-up change，由人类决策优先级。
