<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round1-execution-report.md -->

# Platform Redesign · Round 1 执行报告

> 状态：**已完成（Phase 1–3）**
> 报告时间：2026-04-20
> 关联计划：[Master Plan](../2026-04-20-platform-redesign-rollout-implementation.md) ·
> [01 Frontend](01-frontend-workstream.md) · [02 Backend](02-backend-workstream.md) ·
> [03 Cross-cutting](03-cross-cutting-concerns.md) · [04 Cutover](04-cutover-and-migration.md) ·
> [05 Governance](05-governance-and-process.md)

---

## 0. TL;DR

  | 指标 | 目标 | 实际 | 结论 |
  | --- | --- | --- | --- |
  | TypeScript (`tsc --noEmit`) | 0 errors | **0 errors** | PASS |
  | Vitest | all green | **96 files / 603 tests passed** | PASS |
  | Pytest unit | all green | **1388 passed**（覆盖率 92.98%，门槛 95% 未达）| 测试 PASS / 覆盖率待补 |
  | Pytest integration | all green | **200 passed** | PASS |
  | Alembic 链路 | 单一 head | **`20260420_04` (head)**，4 条新迁移 import OK | PASS |
  | Ruff (`app/`) | 不引入回归 | 261 errors（与 main 持平，**0 回归**）| PASS |
  | 后端蓝图自检 | 新 v1 路由可注册 | `scheduled_queries`、`user_preferences` Blueprint OK | PASS |

Round 1 关闭，可进入 **Round 2 切换准备** (Cutover, [04-cutover-and-migration.md](04-cutover-and-migration.md))。

---

## 1. 交付范围（Phase 1 + 2）

### 1.1 体量

  | 维度 | 数字 |
  | --- | --- |
  | 修改文件 | 40 |
  | 新增文件 | 114 |
  | `frontend/src/v2/**` | 138 个 `.ts/.tsx`，**24,949 行** |
  | 新增后端模块 | 13 个（service/repo/api/domain）|
  | 新增 alembic 迁移 | 4 条（`20260420_01..04`）|
  | 新增集成测试目录 | 6 个（`datasources`、`ontology`、`semantic`、`queries`、`users`、`app_instances`）|

### 1.2 前端 v2 落地（Phase 2 · 5 个 sub-agent）

  | Sub-agent | 主要成果 |
  | --- | --- |
  | FE-Data | `frontend/src/v2/pages/data/*` Datasources / Datasets / ExtractionTasks / ExtractionRuns 全 CRUD + Peek |
  | FE-Query | `frontend/src/v2/pages/query/*` SQL Lab / MyQueries / Scheduled / Executions |
  | FE-Semantic | `frontend/src/v2/pages/semantic/*` 双层语义建模（业务对象/关系/指标 + 物理 Cube）+ DevTools / Domains / Governance |
  | FE-Apps | `frontend/src/v2/pages/apps/*` 应用市场 / 实例 / 监控 |
  | FE-Config | `frontend/src/v2/pages/config/*` 用户偏好 / 频道 / 订阅 |

### 1.3 后端扩展与新建（Phase 2 · 3 个 sub-agent）

  | Sub-agent | 主要成果 |
  | --- | --- |
  | BE-extend-A | 扩展现有蓝图，对齐前端字段（`app/interfaces/api/v1/datasources.py`、`semantic.py`、`ontology.py`、`app_instances.py`）|
  | BE-extend-B | 业务读模型补齐（[`app/application/ontology/object_search_service.py`](../../../../app/application/ontology/object_search_service.py)、[`workbench_read_service.py`](../../../../app/application/ontology/workbench_read_service.py)、[`cube_listing_service.py`](../../../../app/application/semantic/cube_listing_service.py)）|
  | BE-new | 4 个新能力：用户偏好、视图物化、计划查询、诊断运行；含 domain/repo/service/api 全栈 |

### 1.4 跨切关注点（Phase 2 · X-Crosscut sub-agent）

按 [03-cross-cutting-concerns.md](03-cross-cutting-concerns.md) 落地：

- 前端 `frontend/src/v2/`：design tokens、`api/client.ts` axios + JWT、`AppShell`、`PeekPanel`、`EntityFormDialog`、`ResourceListPage`（full + shell 双模式）。
- i18n：`frontend/src/v2/i18n/index.ts`，`zh.json` fallback，`Intl.NumberFormat / DateTimeFormat`。
- Auth bypass：`VITE_AUTH_BYPASS` env，开发期解放鉴权。
- TS 配置：`tsconfig.json` 升级到 `ES2021`、加入 `vite/client` 与 `@v2/*` alias。

---

## 2. Phase 3 Sanity Check 结果

### 2.1 Frontend

  ```text
  $ npx tsc --noEmit --pretty false
  (no output, exit 0)
  ```

  ```text
  $ npx vitest run --reporter=dot
   Test Files  96 passed (96)
        Tests  603 passed (603)
     Duration  21.34s
  ```

修复路径（按时间序）：

1. 基础组件 API 对齐
   - [`Button.tsx`](../../../../frontend/src/v2/components/ui/Button.tsx) 新增 `loading`
   - [`Table.tsx`](../../../../frontend/src/v2/components/ui/Table.tsx) 新增 `emptyText`
   - [`PeekPanel.tsx`](../../../../frontend/src/v2/components/PeekPanel.tsx) 新增 `actions`
   - 新建 [`Tabs.tsx`](../../../../frontend/src/v2/components/ui/Tabs.tsx)
   - [`Card.tsx`](../../../../frontend/src/v2/components/ui/Card.tsx) `CardHead` 加 `subtitle / actions`
   - [`EntityFormDialog.tsx`](../../../../frontend/src/v2/components/EntityFormDialog.tsx) 新增 `loading`，并把 `fields/key` 归一为 `schema/name`
   - [`ResourceListPage.tsx`](../../../../frontend/src/v2/components/ResourceListPage.tsx) 增加 "shell" 模式以承接 children；`SkeletonRows` props 修正 `count→rows`
2. 配置对齐
   - `frontend/tsconfig.json`：`target/lib → ES2021`，`types += vite/client`，`paths += @v2/*`
   - `frontend/src/v2/api/client.ts`：`AxiosHeaders` 显式类型
3. 后端契约对齐（10 个 semantic 页面由 sub-agent 统一改齐字段：`source_object_name`、`run_type/start_time/end_time` 等）

### 2.2 Backend

  ```text
  $ PYTHONPATH=. pytest tests/unit -x --no-header -q
  ... 1388 passed in 31.15s
  TOTAL coverage 92.98% (gate 95% 未达，详见 §4 风险)

  $ PYTHONPATH=. pytest tests/integration -x --no-cov
  ... 200 passed in 6.96s
  ```

  ```text
  $ FLASK_APP=app:create_app flask db heads
  ... 20260420_04 (head)
  ```

新迁移文件结构验证（4 条均含 `revision/down_revision/upgrade/downgrade`）：

  ```text
  20260316_01 -> 20260420_01 -> 20260420_02 -> 20260420_03 -> 20260420_04
  ```

> 注：`flask db upgrade --sql`（offline 模式）在 pre-existing 的 `20260316_01_formalize_semantic_registry.py`
> 处报 `NoInspectionAvailable`（该迁移在 upgrade 中调用 `sa.inspect(bind)`，offline 不支持）；
> 这是历史遗留问题，**不在本轮改动范围**。在线 upgrade（实库连接）链路本身可达 `head`。

### 2.3 Lint

  ```text
  before changes (git stash) : Found 261 errors
  after changes               : Found 261 errors
  ```

→ **0 回归**。261 个均为 main 上历史问题，列入 [05-governance-and-process.md](05-governance-and-process.md) 的清理 backlog。

---

## 3. 关键决策与设计变更

1. **`ResourceListPage` 双模式**：原本只支持 table-driven；为了兼容 sub-agent 的 children 用法，
   把 `rows / columns / rowKey` 全部改为可选，并在有 `children` 时降级为 Card shell。
   命名导出 + 默认导出 shim 同时保留，向后兼容。
2. **`EntityFormDialog` 字段归一**：内部把 `fields → schema`、`key → name` 自动转换，
   避免在 ~20 处 call site 改写。
3. **后端类型权威源**：`frontend/src/v2/api/ontology.ts` 与 `semantic.ts` 是与 `app/interfaces/api/v1/*`
   契约的唯一前端镜像；语义页面由 sub-agent 一次性按权威源改齐字段。
4. **drop-frontend 落地**：根据 [03-cross-cutting-concerns.md](03-cross-cutting-concerns.md) §对齐规则，
   后端不支持的 column / 字段在 sub-agent 修复中直接删除（不 hide），符合"完整性优先"原则。

---

## 4. 风险与待办

  | 风险 / 待办 | 说明 | 处理方 | 触发条件 |
  | --- | --- | --- | --- |
  | 单元测试覆盖率 92.98% < 95% 门槛 | 主要缺口：`scheduled_queries.py` 34%、`user_preferences.py` 52%、`semantic.py` 79% | BE-new sub-agent 后续 | Round 2 第 1 周补齐 |
  | `app/di/container.py` 93 ruff 错误 | 历史问题（与本轮无关），但属于 X-Crosscut 后续清理 | X-Crosscut | Round 2 第 2 周 |
  | Alembic offline `--sql` 在 `20260316_01` 处失败 | Pre-existing；改为在线 upgrade 即可 | DB 同学 | 不阻塞，记录 issue 即可 |
  | 138 个 v2 文件尚未做视觉基线 diff | 计划在 Round 2 用 Playwright snapshot 对齐 demo | FE 全员 | Round 2 第 1 周 |
  | E2E 仅覆盖 `ontology-browse.spec.ts` 等少量 | 需要 P1~P22 全量补齐 | FE-QA | Round 2 第 2-3 周 |

---

## 5. Round 2 入口建议

按 [04-cutover-and-migration.md](04-cutover-and-migration.md) 的节奏，Round 2 第一周聚焦：

1. **测试补齐**：把单元覆盖率拉回 ≥ 95%（重点：`scheduled_queries.py`、`user_preferences.py`、`semantic.py`）。
2. **视觉基线**：把 `tmp/platform-redesign/` 截图作为 Playwright snapshot baseline，
   并在 `frontend/tests/e2e-node/v2/*.visual.spec.ts` 落地。
3. **路由收口**：`frontend/src/main.tsx` 切到 `frontend/src/v2/routes.tsx`，legacy 路由进入 `legacy/` 命名空间。
4. **Cutover 演练**：按 [04-cutover-and-migration.md](04-cutover-and-migration.md) §Day-3 排练顺序走一次冷启动。

---

## 6. 附录 · 命令清单（用于复现）

  ```bash
  # frontend
  cd frontend
  npx tsc --noEmit
  npx vitest run

  # backend
  PYTHONPATH=. pytest tests/unit -x -q
  PYTHONPATH=. pytest tests/integration -x --no-cov -q

  # alembic
  FLASK_APP=app:create_app flask db heads
  ```
