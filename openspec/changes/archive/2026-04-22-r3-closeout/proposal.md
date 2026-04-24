# Change: Round 3 收敛（R3-closeout）

## Why

Round 3 的主线工作（后端数据层修复 / 前端契约对齐 / 覆盖率重校准 / E2E 收敛 / QueryBuilder 原型承接）已在本仓库内完整落地，但分散在 ~15 轮对话里，缺少一份"结构化事后记录"。Round 4 kickoff 时需要一份可读的上下文：**做了什么 / 为什么这样做 / 留下了哪些 known gap**，否则新一轮工作会重复遍历既有决策。

## What Changes

- **归档**：把 Round 3 最后 3 个 commit（`2bd4e2b` / `09892dd` / `d389c20`）对应的实际交付成果，结构化沉淀为一份 OpenSpec change archive，指向 docs/quality 与 docs/archive 中的具体产物
- **不新增 spec 能力**：本 change 是 **infrastructure / cleanup 性质**（重构、测试补齐、原型承接），不修改既有 capability 的 requirement；因此使用 `archive --skip-specs`
- **显式记录 known gap**：
  - `/queries/visual` 只承接"同步查询可视化构建"，**未** 承接"异步数据导出"（由 follow-up change `add-query-export` 跟进）
  - Round 3 期间全量 lint 仍有 ~50+ `react-refresh/only-export-components` warning（pre-commit 只对 staged 文件拦截；follow-up change `lint-fast-refresh-cleanup` 跟进）
  - E2E p23~p30 为 smoke 级，尚未覆盖完整操作回路（follow-up change `e2e-interaction-paths` 跟进）

## Capabilities

### New Capabilities

无。本 change 不引入新 capability，仅沉淀 Round 3 的事后叙事。

### Modified Capabilities

无。Round 3 的实际代码改动触达的既有能力（queries execution / dataset profile / audit logging / subscription delivery 等）其 requirement 未发生 spec-level 变化，仅是实现/契约/覆盖率层面的修复与补齐。

## Impact

- **文档**：openspec/changes/archive/YYYY-MM-DD-r3-closeout/ 形成一份完整档案（proposal + design + tasks）
- **后续 change 起点**：建议按顺序 propose：
  1. `add-query-export`（异步数据导出的完整 feature）
  2. `lint-fast-refresh-cleanup`（_shared/*-content 抽 helpers）
  3. `e2e-interaction-paths`（p23~p30 操作回路加深）
- **无 API / schema / DB 影响**：纯文档 change
