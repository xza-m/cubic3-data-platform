# Round 3 收敛 · 任务清单

> 本文档记录 Round 3 收敛阶段已完成的任务，对应 3 个 commit：
> - `2bd4e2b` R3-closeout(1/3) 主线联调收敛
> - `09892dd` R3-closeout(2/3) E2E 收敛
> - `d389c20` R3-closeout(3/3) /queries/visual 承接 QueryBuilder 原型
>
> 所有任务完成于 push 到 `origin/main` 时（2026-04-22）。

## 状态说明

- `[x]` 已完成（Round 3 内）
- `[>]` 推迟到 follow-up change
- `[-]` 决策后取消

---

## 1. Commit 1/3 · 主线联调收敛（`2bd4e2b`）

### 1.1 后端应用层修复
- [x] 1.1.1 `app/application/query/handlers/query_list_handlers` 字段对齐
- [x] 1.1.2 `app/application/users/user_service` 异常路径补齐
- [x] 1.1.3 `app/application/services/config/{channel,delivery,subscription}_service` 幂等/校验修复
- [x] 1.1.4 新增 `app/application/dataset/handlers/profile_dataset_handler`（dataset profile 能力独立化）
- [x] 1.1.5 新增 `app/application/services/config/domain_publish_history_service`

### 1.2 后端领域/基础设施
- [x] 1.2.1 新增 `app/domain/entities/config/domain_publish_record`
- [x] 1.2.2 新增 `app/domain/entities/config/subscription_delivery_log`
- [x] 1.2.3 `app/domain/ports/repositories/query_repository` 补齐端口
- [x] 1.2.4 `app/infrastructure/repositories/{query,subscription}_repository` 实现跟进
- [x] 1.2.5 `app/infrastructure/users/{models,repositories}` ORM 补齐
- [x] 1.2.6 `app/di/container` 装配新 service

### 1.3 API 契约对齐（`app/interfaces/api/v1/`）
- [x] 1.3.1 `auth / channels / datasets / queries / semantic / subscriptions / users`：响应 Envelope / 字段命名 / 校验同步 v2 前端契约

### 1.4 数据迁移
- [x] 1.4.1 `migrations/versions/20260422_01_add_subscription_delivery_logs`
- [x] 1.4.2 `migrations/versions/20260422_02_add_audit_tables`

### 1.5 覆盖率与校验规则
- [x] 1.5.1 `scripts/backend_coverage_rules.json` 重校准
- [x] 1.5.2 `scripts/verify_rules.json` 重校准
- [x] 1.5.3 删除 `scripts/checks/frontend_coverage_guard.py`（迁到 frontend 自备 gate）
- [x] 1.5.4 删除 `scripts/frontend_coverage_rules.json` 及其单测
- [x] 1.5.5 `tests/unit/application/users/test_user_service` 补用例
- [x] 1.5.6 `docs/quality/{backend,frontend,testing,backend-coverage,frontend-coverage}` 同步

### 1.6 前端 v2 API / hooks 对齐
- [x] 1.6.1 `frontend/src/v2/api/{channels,datasets,extraction,queries,roles,semantic,subscriptions,users}` 契约同步
- [x] 1.6.2 `frontend/src/v2/hooks/{queries,roles,users,semantic}` 及其单测 mutation/缓存 key 规范化

### 1.7 前端 v2 页面联调修复
- [x] 1.7.1 Dashboard / Login
- [x] 1.7.2 config: ChannelDetail / RoleDetail / Roles / UserDetail / Users
- [x] 1.7.3 data: Datasets / Datasources / ExtractionTaskDetail / _shared/dataset-detail-content
- [x] 1.7.4 queries: QueriesSaved / QueriesSavedCreate / QueriesSavedDetail / QueryHistoryDetail
- [x] 1.7.5 semantic: DomainCanvas / ViewDetail

### 1.8 前端路由与导航
- [x] 1.8.1 `routes.tsx`：挂载 DatasourceCreate / ExtractionTaskCreate / QueriesSavedCreate
- [x] 1.8.2 `/data-center/datasets/new` 重定向到 `/register`
- [x] 1.8.3 `/extraction` 统一前缀，legacy `/extraction-tasks` 重定向
- [x] 1.8.4 `layout/navigation` 同步

### 1.9 i18n 与设计 token
- [x] 1.9.1 `i18n/{zh,en}.json` 补齐 login 品牌文案 / datasets SQL 预览 / channel 配置校验等新 key
- [x] 1.9.2 `i18n/{zh,en}.json` 预埋 queryVisual.\* 41 个 key（页面在 commit 3 承接）
- [x] 1.9.3 `scripts/check-v2-tokens` 规则扩展
- [x] 1.9.4 `scripts/i18n-keys.summary` 快照同步

### 1.10 本地 CI 闸门
- [x] 1.10.1 `.husky/pre-commit`（< 5s · lint-staged 对 staged `*.ts/tsx/css` 跑 eslint --fix）
- [x] 1.10.2 `.husky/pre-push`（< 90s · `ci:pre-push` = tsc + lint:v2 + vitest + v2 build）
- [x] 1.10.3 `Makefile` 新增/调整 local-smoke 等 targets

### 1.11 顺带清理
- [x] 1.11.1 `frontend/src/v2/pages/config/channels/ChannelDetail` - `rows` 用 `useMemo` 包裹
- [x] 1.11.2 `frontend/src/v2/pages/semantic/domains/DomainCanvas` - `nodes` / `edges` 用 `useMemo`
- [x] 1.11.3 `frontend/src/v2/pages/data/_shared/dataset-detail-content` 顶部加 eslint-disable 说明（helper + component 共存是历史约定）
- [x] 1.11.4 `docs/archive/2026-01/*` 4 份归档文档小幅修订
- [x] 1.11.5 `frontend/tests/CONFIG_CENTER_TEST_PLAN` → `docs/archive/2026-01/` 归档
- [x] 1.11.6 `openspec/changes/archive/2026-01-25-config-center-ui/tasks` 收尾勾选

---

## 2. Commit 2/3 · E2E 收敛（`09892dd`）

### 2.1 补齐 e2e-v2 缺口
- [x] 2.1.1 `tests/e2e-v2/p23-dashboard-shell-smoke` (Dashboard + 左右导航骨架)
- [x] 2.1.2 `tests/e2e-v2/p24-cube-browse-smoke` (Cube 浏览)
- [x] 2.1.3 `tests/e2e-v2/p25-domain-catalog-smoke` (数据域目录)
- [x] 2.1.4 `tests/e2e-v2/p26-ontology-workbench-smoke` (本体工作台)
- [x] 2.1.5 `tests/e2e-v2/p27-data-inventory-smoke` (数据清单)
- [x] 2.1.6 `tests/e2e-v2/p28-query-analysis-smoke` (查询分析)
- [x] 2.1.7 `tests/e2e-v2/p29-legacy-redirect-smoke` (老 URL → v2 重定向回归)
- [x] 2.1.8 `tests/e2e-v2/smoke/routes-smoke` (全量路由表可达性冒烟)

### 2.2 清理 legacy e2e-node
- [x] 2.2.1 删除 `tests/e2e-node/` 11 个 spec + helpers（cube-browse / cube-draft / devtools-browse / domain-catalog / domain-creation / domain-publish / ontology-browse / platform-data-inventory / platform-query-analysis / platform-shell / helpers）
- [x] 2.2.2 删除 `frontend/playwright.config.ts`
- [x] 2.2.3 `frontend/package.json` 移除 `test:e2e` 入口，保留 `test:e2e:v2` / `test:e2e:v2:smoke`

### 2.3 文档同步
- [x] 2.3.1 新建 `docs/quality/e2e-coverage-gaps.md`：v2 前 7 个 gap 对应的承接表
- [x] 2.3.2 `frontend/README.md` 测试章节指向 `test:e2e:v2`
- [x] 2.3.3 `.planning/codebase/TESTING.md` 脚本清单切换
- [x] 2.3.4 `README.md`（root）`local-smoke` 指向 smoke-frontend (Playwright v2)

---

## 3. Commit 3/3 · /queries/visual 承接 QueryBuilder 原型（`d389c20`）

### 3.1 归档原型
- [x] 3.1.1 `frontend/QueryBuilder.tsx` → `docs/archive/legacy-prototypes/QueryBuilder.tsx.txt`（git rename · 93% 相似）
- [x] 3.1.2 头部补 banner：说明原型是 FY25 "自助数据导出" 方向 / 后端未跟进 / v2 重塑为"可视化查询构建器" / 指向 src/v2/pages/queries/visual 新实现

### 3.2 新 v2 模块（`frontend/src/v2/pages/queries/visual/`）
- [x] 3.2.1 `types.ts`：FilterOp / FilterRule / QueryDraft + emptyDraft / emptyFilter / valueShape
- [x] 3.2.2 `buildSql.ts`：纯函数 SQL 生成器 · 标识符/字面量按类型引用 · sensitive 字段自动 mask · BETWEEN/LIKE/IN/IS NULL 等 9 个操作符 · 采集 issues（error/warning）
- [x] 3.2.3 `buildSql.test.ts`：39 个单测覆盖 quoteIdent/quoteLiteral/quoteTable/literalFor/selectExpr/maskExprFor/buildSql 全路径
- [x] 3.2.4 `FieldTree.tsx`：按 business_type 分组（dimension/metric/partition/other）+ 关键词搜索 + 敏感标记 + Select All/Clear
- [x] 3.2.5 `FilterPanel.tsx`：动态筛选行 · 操作符切换时自动变形值输入（单值/列表/区间/无值）
- [x] 3.2.6 `SqlPreview.tsx`：轻量客户端 SQL 高亮（无 Monaco 依赖）+ 复制 + 打开至 QueryConsole
- [x] 3.2.7 `QueryVisual.tsx`：主页面编排 + MiniResultTable · useDatasets/useDataset/useExecuteQuery 联动
- [x] 3.2.8 `QueryVisual.test.tsx`：7 个 RTL 交互测（渲染/自动选集/选字段→SQL 更新/加过滤/跳 QueryConsole/执行返回结果）

### 3.3 QueryConsole 预填契约
- [x] 3.3.1 `frontend/src/v2/pages/queries/QueryConsole.tsx`：`consumeVisualPrefill` 在挂载时消费 `sessionStorage[v2:queryVisual:pendingPrefill]`（`{sql, source_id}`）→ 初始化编辑器 SQL + source，一次性清除 key

### 3.4 路由挂载
- [x] 3.4.1 `frontend/src/v2/routes.tsx`：替换 `/queries/visual` Placeholder → `<QueryVisual />`（lazy）

### 3.5 E2E 冒烟
- [x] 3.5.1 `tests/e2e-v2/p30-query-visual-smoke`：3 个 test · 页面载入 + 选字段 SQL 更新 + Add filter 增加筛选行

---

## 4. Follow-up（不在本 change 范围内）

> 以下条目**不**在 R3-closeout 完成，已作为后续 change 候选。Round 4 kickoff 时由人类决策优先级。

- [>] 4.1 **add-query-export**：后端 `/api/v1/queries/export` + RQ 队列 + 结果存储 + 下载；前端 `/queries/export` 页；仿 ExecuteTaskHandler 模式，复用现有 `app.infrastructure.tasks.jobs` 基础设施
- [>] 4.2 **lint-fast-refresh-cleanup**：把 12 个 `frontend/src/v2/pages/**/_shared/*-content.tsx` 的 helper 抽到独立文件，消除 `react-refresh/only-export-components` warning（当前 ~30+ 处）
- [>] 4.3 **e2e-interaction-paths**：p23~p30 从 smoke 升级到操作回路（完整用户流程）

---

## 验证证据

- `git log --oneline` 可见 3 个 R3-closeout commit
- push 时 `pre-push` gate（tsc + lint:v2 + vitest + v2 build）全绿：50 test files / 535 tests passed，dist-v2 构建成功含 `QueryVisual-*.js`（22.60 kB / gzip 7.01 kB）
- `openspec/changes/archive/YYYY-MM-DD-r3-closeout/` 本 change archive 文件自身
