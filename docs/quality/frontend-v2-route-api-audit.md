---
doc_type: baseline
status: current
source_of_truth: secondary
owner: frontend
last_reviewed: 2026-04-25
---

# v2 路由与 API 契约审计

本文档记录前端 v2 cutover 后的当前路由、后端 API 承接关系和已知缺口。
它不是新的产品规划；真正的实现真相仍以 `frontend/src/v2/routes.tsx`、`frontend/src/v2/api/*` 与 `app/interfaces/api/v1/*` 为准。

## 1. 审计结论

- 当前前端已经是 v2-only：`frontend/src/main.tsx` 只挂载 `@v2/App`，路由总表在 `frontend/src/v2/routes.tsx`。
- `frontend/src/App.tsx` 与 legacy 路由已经不存在，文档中不应继续引用它作为当前入口。
- 语义中心当前主入口是 `/semantic/ontology`；`/semantic/workbench` 是语义诊断工作台，对应 `semantic/devtools/DevTools.tsx`。
- 查询中心仍有多个有效子路由，`/queries/history`、`/queries/my`、`/queries/visual`、`/queries/scheduled`、`/queries/exports` 不是单纯兼容重定向。
- 当前仍有两个明确的前端占位路由：`/data-chat`、`/extraction/config`。
- 当前发现两个前后端契约风险：`/apps/<code>/enable|disable` 前端调用未在后端 `apps.py` 注册；提取任务调度保存前端使用 `PATCH /extraction/tasks/<id>`，后端当前只注册 `PUT /extraction/tasks/<id>`。

## 2. 当前路由承接

| 路由 | 页面承接 | 后端契约 | 状态 |
|---|---|---|---|
| `/dashboard` | `Dashboard.tsx` | `/api/v1/dashboard/overview` | 已接线 |
| `/data-center/datasources` | `data/Datasources.tsx` | `/api/v1/data-center/datasources` | 已接线 |
| `/data-center/datasources/new` | `data/DatasourceCreate.tsx` | `/api/v1/data-center/datasources` | 已接线 |
| `/data-center/datasources/:id` | `data/DatasourceDetail.tsx` | `/api/v1/data-center/datasources/<id>` | 已接线 |
| `/data-center/datasets` | `data/Datasets.tsx` | `/api/v1/data-center/datasets` | 已接线 |
| `/data-center/datasets/register[/table|/file]` | `data/DatasetCreate.tsx` | `/api/v1/data-center/datasets` | 已接线 |
| `/data-center/datasets/:id` | `data/DatasetDetail.tsx` | `/api/v1/data-center/datasets/<id>` | 已接线 |
| `/extraction/tasks` | `data/ExtractionTasks.tsx` | `/api/v1/extraction/tasks` | 已接线 |
| `/extraction/tasks/new` | `data/ExtractionTaskCreate.tsx` | `/api/v1/extraction/tasks` | 已接线 |
| `/extraction/tasks/:id` | `data/ExtractionTaskDetail.tsx` | 列表过滤；后端暂无 `GET /tasks/<id>` | 已接线，存在契约备注 |
| `/extraction/runs` | `data/ExtractionRuns.tsx` | `/api/v1/extraction/runs` | 已接线 |
| `/extraction/runs/:id` | `data/ExtractionRunDetail.tsx` | 列表过滤；日志和重跑有独立接口 | 已接线 |
| `/extraction/config` | `_Placeholder.tsx` | 无独立页面契约 | 占位 |
| `/data-chat` | `_Placeholder.tsx` | 后端 `/api/v1/conversations` 已存在 | 占位 |
| `/queries` | `queries/QueryConsole.tsx` | `/api/v1/queries/execute` | 已接线 |
| `/queries/my` | `queries/QueriesSaved.tsx` | `/api/v1/queries` | 已接线 |
| `/queries/history` | `queries/QueryHistory.tsx` | `/api/v1/queries/histories` | 已接线 |
| `/queries/visual` | `queries/visual/QueryVisual.tsx` | 前端构建 SQL，执行仍走 `/queries/execute` | 已接线 |
| `/queries/scheduled` | `queries/QueriesScheduled.tsx` | `/api/v1/queries/scheduled` | 已接线 |
| `/queries/exports` | `queries/QueryExports.tsx` | `/api/v1/queries/exports` | 已接线 |
| `/apps` | `apps/Marketplace.tsx` | `/api/v1/apps` | 已接线，存在契约风险 |
| `/apps/:code` | `apps/AppDetail.tsx` | `/api/v1/apps/<code>` | 已接线 |
| `/apps/instances` | `apps/instances/Instances.tsx` | `/api/v1/app-instances` | 已接线 |
| `/executions` | `apps/executions/Executions.tsx` | `/api/v1/app-executions` | 已接线 |
| `/config/channels` | `config/channels/Channels.tsx` | `/api/v1/channels` | 已接线 |
| `/config/subscriptions` | `config/subscriptions/Subscriptions.tsx` | `/api/v1/subscriptions` | 已接线 |
| `/settings` | `settings/Settings.tsx` | `/api/v1/access/me/preferences` | 已接线 |
| `/semantic/ontology` | `semantic/ontology/Workbench.tsx` | `/api/v1/ontology/workbench/*` | 已接线 |
| `/semantic/ontology/objects` | `semantic/ontology/Objects.tsx` | `/api/v1/ontology/objects` | 已接线 |
| `/semantic/ontology/objects/:name` | `semantic/ontology/ObjectDetail.tsx` | `/api/v1/ontology/objects/<name>` | 已接线 |
| `/semantic/ontology/objects/:name/edit` | `semantic/ontology/ObjectEdit.tsx` | `POST /api/v1/ontology/objects` 幂等更新 | 已接线 |
| `/semantic/ontology/metrics` | `semantic/ontology/Metrics.tsx` | `/api/v1/ontology/metrics` | 已接线 |
| `/semantic/ontology/relations` | `semantic/ontology/Relations.tsx` | `/api/v1/ontology/relations` | 已接线 |
| `/semantic/ontology/governance` | `semantic/ontology/Governance.tsx` | `/api/v1/ontology/policies`、`/api/v1/governance/audit-traces` | 已接线 |
| `/semantic/workbench` | `semantic/devtools/DevTools.tsx` | `/api/v1/semantic/diagnose`、`/api/v1/semantic/diagnose/runs` | 已接线，语义诊断 |
| `/semantic/cubes` | `semantic/cubes/Cubes.tsx` | `/api/v1/semantic/cubes` | 已接线 |
| `/semantic/cubes/new` | `semantic/cubes/CubeCreate.tsx` | `/api/v1/semantic/cubes` | 已接线 |
| `/semantic/cubes/:name` | `semantic/cubes/CubeDetail.tsx` | `/api/v1/semantic/cubes/<name>` | 已接线 |
| `/semantic/cubes/:name/edit` | `semantic/cubes/CubeEdit.tsx` | `/api/v1/semantic/cubes/<name>` | 已接线 |
| `/semantic/domains` | `semantic/domains/Domains.tsx` | `/api/v1/semantic/domains` | 已接线 |
| `/semantic/domains/:id` | `semantic/domains/DomainCanvas.tsx` | `/api/v1/semantic/domains/<id>` | 已接线 |
| `/semantic/views/:name` | `semantic/views/ViewDetail.tsx` | `/api/v1/semantic/views/<name>` | 已接线 |
| `/semantic/relations` | `semantic/relations/RelationCanvas.tsx` | `/api/v1/semantic/graph` 等语义图数据 | 已接线 |

## 3. 兼容重定向

`frontend/src/v2/routes.tsx` 当前保留以下 legacy 兼容入口：

| 旧路径 | 当前目标 |
|---|---|
| `/queries/editor` | `/queries` |
| `/queries/templates` | `/queries` |
| `/semantic/overview` | `/semantic/workbench` |
| `/semantic/tools` | `/semantic/workbench` |
| `/semantic/ide` | `/semantic/workbench` |
| `/semantic/devtools` | `/semantic/workbench` |
| `/semantic/playground` | `/semantic/cubes` |
| `/semantic/canvas` | `/semantic/domains` |
| `/semantic/modeling` | `/semantic/domains` |
| `/semantic/visual-model` | `/semantic/domains` |
| `/semantic/visual-model/:id` | `/semantic/domains/:id` |
| `/semantic/domains/:id/canvas` | `/semantic/domains/:id` |

说明：`/queries/history`、`/queries/my`、`/queries/visual`、`/queries/scheduled` 当前是有效页面，不属于旧兼容入口。

## 4. API 契约风险

| 风险 | 现状 | 建议处理 |
|---|---|---|
| 应用启停接口缺口 | `frontend/src/v2/api/apps.ts` 调用 `/apps/<code>/enable` 与 `/apps/<code>/disable`；后端 `app/interfaces/api/v1/apps.py` 未注册对应路由。 | 二选一：补后端启停接口，或从前端应用市场移除启停动作。推荐补后端接口，因为页面已提供启停交互。 |
| 提取调度保存方法不一致 | `updateTaskSchedule` 使用 `PATCH /extraction/tasks/<id>`；后端 `extraction.py` 当前只支持 `PUT /tasks/<id>`。 | 二选一：前端改为复用 `updateTask` 的 `PUT`，或后端增加 `PATCH` 语义。推荐前端改 `PUT`，保持 KISS。 |
| `/data-chat` 占位 | 后端 `conversations` 主链已存在，并已接入语义路由尝试；v2 前端路由仍是 Placeholder。 | 若本期要恢复智能问数 UI，应创建 v2 DataChat 页面并接 `/api/v1/conversations`；否则文档继续标注为占位。 |
| `/extraction/config` 占位 | v2 已有任务列表、详情和创建页，独立配置入口没有真实页面。 | 若产品仍需要独立配置工作台，补页面；否则从主导航弱化或移除该入口。 |
| Cube 草稿 smoke 仍依赖旧语义上下文 | `frontend/tests/e2e/cube_draft_smoke.py` 当前仍以 `/semantic/workbench?cube=...` 进入草稿后续上下文；该路径在 v2 中是诊断工作台。 | 后续二选一：把 smoke 对齐到 Cube 创建/编辑真实页面，或为诊断页明确保留该调试入口。推荐前者，避免测试继续绑定诊断路由。 |

## 5. 测试覆盖

- v2 Playwright 套件位于 `frontend/tests/e2e-v2/`，覆盖 P1-P31、smoke、a11y 和 visual。
- v2 smoke 入口是 `npm run e2e:smoke`，仓库封装为 `make smoke-frontend`。
- 语义专项真实烟测仍由 `make smoke-semantic` 调用 `frontend/tests/e2e/domain_creation_smoke.py`、`domain_publish_smoke.py` 和 `cube_draft_smoke.py`。
- 其中 `cube_draft_smoke.py` 仍需后续重新对齐 v2 Cube 草稿页面；在完成前，它代表诊断链路覆盖，不应被解读为 Cube 编辑页的完整契约测试。
- `make test-regression-*` 与 `make semantic-layout` 已随 legacy 清理退役，不再作为当前验证入口。

## 6. 后续维护规则

- 新增或删除前端路由时，同步检查本页、`frontend/README.md`、`docs/TECH_STACK_AND_ARCHITECTURE.md` 与 `docs/architecture/frontend.md`。
- 新增前端 API 调用时，先确认 `app/interfaces/api/v1/*` 已有对应路由；不确定时把风险记录到本页。
- 占位页不应在文档中写成“已落地功能”，除非对应页面文件和 API 交互都已接线。
