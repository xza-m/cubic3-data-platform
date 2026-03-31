---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-03-26
---

# 前端覆盖率看板

本文档用于跟踪前端 coverage 的当前基线、质量门槛与核心页面守护约束。
统一入口固定为仓库根目录 `make coverage-frontend`；机器规则由 `scripts/frontend_coverage_rules.json` 定义，执行检查由 `scripts/checks/frontend_coverage_guard.py` 负责。

## 1. 当前快照

**刷新时间**：2026-03-26  
**口径**：`make coverage-frontend`  
**当前事实**：

- 前端总覆盖率：`91.19%`
- statements：`91.19%`
- functions：`85.47%`
- branches：`84.17%`
- 当前目标门槛：总覆盖率 `>=90%`
- 当前核心功能与实体页目标：指定核心页面行覆盖率 `100%`

这意味着：前端 coverage 已经达到专项质量门槛，`make coverage-frontend` 当前应作为稳定守护入口使用；后续重点不再是单纯追总盘子，而是守住核心页面 `100%` 并继续收齐长尾模块的均匀度。

## 2. 当前机器守护规则

- 总覆盖率：`>=90%`
- 核心功能与实体页：`100%`

当前核心功能与实体页名单：

- `src/pages/Login.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Datasources.tsx`
- `src/pages/DatasetDetail.tsx`
- `src/pages/DatasetRegister.tsx`
- `src/pages/FileDatasetRegister.tsx`
- `src/pages/Datasets.tsx`
- `src/pages/DataChat.tsx`
- `src/pages/AppCenter/AppMarket.tsx`
- `src/pages/AppCenter/ExecutionMonitor.tsx`
- `src/pages/QueryCenter/Dashboard.tsx`
- `src/pages/Semantic/CubeList.tsx`
- `src/pages/Semantic/DomainList.tsx`
- `src/pages/Semantic/CubeStudio.tsx`
- `src/pages/Semantic/DomainCanvas.tsx`
- `src/pages/Semantic/DomainModelingEntry.tsx`
- `src/pages/Semantic/RelationCanvas.tsx`
- `src/pages/Semantic/Playground.tsx`
- `src/pages/Semantic/ViewDetail.tsx`
- `src/pages/Semantic/DevTools.tsx`

## 3. 当前主要缺口

从最近一次 `make coverage-frontend` 看，前端 coverage 的主要缺口已经从核心页面转移到非核心长尾模块，主要集中在：

- `src/components/AppCenter`
- `src/api`
- `src/utils`
- `src/App.tsx` 与 `src/main.tsx`

当前核心功能与实体页已经全部达到 `100%` 行覆盖，因此前端 coverage 约束现在承担的是“持续守护核心边界并约束总盘子不得跌破 90%”的角色。

## 4. 使用原则

- 前端 coverage 属于专项验证或质量门槛，不并入默认 `make verify-frontend`
- 需要确认前端测试覆盖率基线、评审质量门槛或推进 coverage 项目时，运行 `make coverage-frontend`
- 前端 coverage 的目标不是单纯刷总盘子数字，而是保证核心功能与实体页不会退化，并逐步收齐关键模块的覆盖率均匀度
- 后续推进应优先按模块补齐：
  - `src/components/AppCenter`
  - `src/api`
  - `src/utils`
  - `src/App.tsx` / `src/main.tsx`

## 5. 更新规则

- 每次运行 `make coverage-frontend` 并据此做决策时，都应同步更新本页快照
- 若核心功能与实体页名单发生变化，必须同时更新：
  - 本页
  - `scripts/frontend_coverage_rules.json`
  - `docs/quality/testing.md`
