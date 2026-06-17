---
doc_type: baseline
status: current
source_of_truth: secondary
owner: frontend
last_reviewed: 2026-06-09
---

# v2 路由与 API 契约审计

本文档记录前端 v2 cutover 后的当前路由、后端 API 承接关系和已知缺口。
它不是新的产品规划；真正的实现真相仍以 `frontend/src/v2/routes.tsx`、`frontend/src/v2/api/*` 与 `app/interfaces/api/v1/*` 为准。

## 1. 审计结论

- 当前前端已经是 v2-only：`frontend/src/main.tsx` 只挂载 `@v2/App`，路由总表在 `frontend/src/v2/routes.tsx`。
- `frontend/src/App.tsx` 与 legacy 路由已经不存在，文档中不应继续引用它作为当前入口。
- 语义中心当前以 `/semantic/modeling-workbench` 承接语义建设，以 `/semantic/assets` 承接语义资产底座，以 `/semantic/cubes` 与 `/semantic/ontology` 承接核心语义资产；`/semantic/workbench` 是语义诊断工作台，对应 `semantic/devtools/DevTools.tsx`。
- 查询中心仍有多个有效子路由，`/queries/history`、`/queries/my`、`/queries/visual`、`/queries/scheduled`、`/queries/exports` 不是单纯兼容重定向。
- 当前仍有一个明确的前端占位路由：`/data-chat`。
- 数据中心当前统一为 `/data-center` 下的正式 IA：连接管理、资产目录、同步任务、影响分析；旧 `/data-center/datasources`、`/data-center/datasets` 与 `/extraction/*` 前端入口不再注册。
- 当前发现一个前后端契约风险：`/apps/<code>/enable|disable` 前端调用未在后端 `apps.py` 注册。
- 全局搜索（CommandPalette）走后端 `GET /api/v1/search?q=&types=cube,domain,metric`（`app/interfaces/api/v1/search.py`），前端 300ms 防抖、空关键字不发请求。
- `/config/*` 导航收敛为统一「配置中心」模块（权限 / 网关 / 渠道 / 订阅共享二级侧栏壳）；路由与后端契约不变。

## 2. 当前路由承接

| 路由 | 页面承接 | 后端契约 | 状态 |
|---|---|---|---|
| `/dashboard` | `Dashboard.tsx` | `/api/v1/dashboard/overview` | 已接线 |
| `/data-center` | `data/DataCenter.tsx` | `/api/v1/data-center/datasources`、`/api/v1/data-center/datasets` | 已接线，数据中心概览 |
| `/data-center/connections` | `data/DataCenter.tsx` | `/api/v1/data-center/datasources` | 已接线，连接管理 Tab |
| `/data-center/connections/new` | `data/DatasourceCreate.tsx` | `/api/v1/data-center/datasources` | 已接线 |
| `/data-center/connections/:id` | `data/DatasourceDetail.tsx` | `/api/v1/data-center/datasources/<id>` | 已接线 |
| `/data-center/connections/:id/edit` | `data/DatasourceCreate.tsx` | `/api/v1/data-center/datasources/<id>` | 已接线 |
| `/data-center/assets` | `data/DataCenter.tsx` | `/api/v1/data-center/datasets` | 已接线，资产目录 Tab |
| `/data-center/assets/register[/table|/file]` | `data/DatasetCreate.tsx` | `/api/v1/data-center/datasets` | 已接线 |
| `/data-center/assets/:id` | `data/DatasetDetail.tsx` | `/api/v1/data-center/datasets/<id>` | 已接线 |
| `/data-center/sync/tasks` | `data/ExtractionTasks.tsx` | `/api/v1/extraction/tasks` | 已接线 |
| `/data-center/sync/tasks/new` | `data/ExtractionTaskCreate.tsx` | `/api/v1/extraction/tasks` | 已接线 |
| `/data-center/sync/tasks/:id` | `data/ExtractionTaskDetail.tsx` | 列表过滤；后端暂无 `GET /tasks/<id>` | 已接线，存在契约备注 |
| `/data-center/sync/runs` | `data/ExtractionRuns.tsx` | `/api/v1/extraction/runs` | 已接线 |
| `/data-center/sync/runs/:id` | `data/ExtractionRunDetail.tsx` | 列表过滤；日志和重跑有独立接口 | 已接线 |
| `/data-center/sync/config` | `data/ExtractionConfig.tsx` | `/api/v1/extraction/health` | 已接线 |
| `/data-center/impact` | `data/DataCenter.tsx` | 同数据中心读模型 | 已接线，影响分析 Tab |
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
| `/semantic/modeling-workbench` | `semantic/modeling-copilot/SemanticModelingWorkbench.tsx` | `/api/v1/semantic/modeling-workbench/projects/*`、`/api/v1/semantic/modeling-copilot/sessions/*` | 已接线，语义建设入口 |
| `/semantic/modeling-workbench/quick` | `semantic/modeling-copilot/SemanticModelingWorkbench.tsx` | `/api/v1/semantic/modeling-copilot/sessions/*` | 已接线，快速单资产入口 |
| `/semantic/modeling-workbench/:projectId/candidate/:candidateId` | `semantic/modeling-copilot/SemanticModelingWorkbench.tsx` | `/api/v1/semantic/modeling-workbench/projects/*`、`/api/v1/semantic/modeling-copilot/sessions/*` | 已接线，批量候选详情 |
| `/semantic/assets` | `semantic/assets/Assets.tsx` | `/api/v1/semantic/assets/radar`、`/api/v1/semantic/assets/tables` | 已接线，资产雷达 |
| `/semantic/assets/tables` | `semantic/assets/Tables.tsx` | `/api/v1/semantic/assets/tables` | 已接线 |
| `/semantic/assets/table-profile` | `semantic/assets/Quality.tsx` | `/api/v1/semantic/assets/table-profile` | 已接线 |
| `/semantic/assets/field-profile` | `semantic/assets/Fields.tsx` | `/api/v1/semantic/assets/field-profile` | 已接线 |
| `/semantic/assets/lineage-usage` | `semantic/assets/Lineage.tsx` | `/api/v1/semantic/assets/lineage-usage` | 已接线 |
| `/semantic/assets/sync` | `semantic/assets/SyncRuns.tsx` | `/api/v1/semantic/assets/sync-runs` | 已接线，元数据同步记录与触发 |
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

`frontend/src/v2/routes.tsx` 当前只保留已上线查询深链的 legacy 兼容入口；语义中心处于新 IA 定版阶段，旧语义入口不再注册兼容重定向。

| 旧路径 | 当前目标 |
|---|---|
| `/queries/console` | `/queries` |
| `/queries/editor` | `/queries` |
| `/queries/templates` | `/queries` |

说明：`/queries/history`、`/queries/my`、`/queries/visual`、`/queries/scheduled` 当前是有效页面，不属于旧兼容入口。

## 4. API 契约风险

| 风险 | 现状 | 建议处理 |
|---|---|---|
| 应用启停接口缺口 | `frontend/src/v2/api/apps.ts` 调用 `/apps/<code>/enable` 与 `/apps/<code>/disable`；后端 `app/interfaces/api/v1/apps.py` 未注册对应路由。 | 二选一：补后端启停接口，或从前端应用市场移除启停动作。推荐补后端接口，因为页面已提供启停交互。 |
| 同步调度保存 | `updateTaskSchedule` 已使用 `PUT /extraction/tasks/<id>`，与后端 `extraction.py` 的 `PUT /tasks/<id>` 保持一致。 | 已收敛；保留 P10 E2E 覆盖保存动作，避免方法漂移。 |
| `/data-chat` 占位 | 后端 `conversations` 主链已存在，并已接入语义路由尝试；v2 前端路由仍是 Placeholder。 | 若本期要恢复智能问数 UI，应创建 v2 DataChat 页面并接 `/api/v1/conversations`；否则文档继续标注为占位。 |
| Cube 草稿 smoke 已从交付门禁下线 | `frontend/tests/e2e/cube_draft_smoke.py` 仍可作为诊断页手工回归参考，但不再由 `make smoke-semantic` 调用；当前语义专项第三段由 `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts` 承接 Modeling Copilot 闭环。 | 保留为诊断参考即可；不要再把它解读为当前 Cube 编辑页或 Modeling Copilot 的产品闭环契约。 |

## 5. 测试覆盖

- v2 Playwright 套件位于 `frontend/tests/e2e-v2/`，覆盖 P1-P31、smoke、a11y 和 visual。
- v2 smoke 入口是 `npm run e2e:smoke`，仓库封装为 `make smoke-frontend`。
- 语义专项烟测由 `make smoke-semantic` 调用 `frontend/tests/e2e/domain_creation_smoke.py`、`domain_publish_smoke.py` 和 `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`。
- Modeling Copilot 真实后端补证入口是 `npm run e2e:modeling-agent-smoke:live`，它会写入真实 session / Proposal / 发布资产，只在发布前或后端契约变更时显式运行。
- `cube_draft_smoke.py` 已从语义专项交付门禁下线；如果后续继续保留，只代表 `/semantic/workbench` 诊断链路的手工参考。
- `make test-regression-*` 与 `make semantic-layout` 已随 legacy 清理退役，不再作为当前验证入口。

## 6. 后续维护规则

- 新增或删除前端路由时，同步检查本页、`frontend/README.md`、`docs/TECH_STACK_AND_ARCHITECTURE.md` 与 `docs/architecture/frontend.md`。
- 新增前端 API 调用时，先确认 `app/interfaces/api/v1/*` 已有对应路由；不确定时把风险记录到本页。
- 占位页不应在文档中写成“已落地功能”，除非对应页面文件和 API 交互都已接线。
