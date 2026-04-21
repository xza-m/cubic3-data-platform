<!-- docs/superpowers/plans/2026-04-20-platform-redesign/route-parity-audit.md -->

# 路由对齐审计 · Round 2 准备

> 状态：**W1 交付**
> 作者：backend-architect agent
> 日期：2026-04-21
> 依据：[Master Plan](../2026-04-20-platform-redesign-rollout-implementation.md) ·
> [04 Cutover](04-cutover-and-migration.md) ·
> [01 Frontend](01-frontend-workstream.md)

---

## § 0 摘要 (TL;DR)

  | 指标 | W1 初始值 | 2026-04-21 对齐后 | **2026-04-21 接线后** |
  | --- | --- | --- | --- |
  | Legacy 路由总数（`App.tsx`） | 48 | 48（不变） | **48**（不变） |
  | V2 路由总数（`v2/routes.tsx`） | 49 | 53 | **53** |
  | ✅ 完全对齐（路径相同） | 20 | 36 ↑ +16 | **36**（不变） |
  | 真实页面接线率（占位 → 真实组件） | 0% | 0% | **39/42 已接线**（92.9%） |
  | `<Placeholder>` 剩余路由数 | 全部 | 全部 | **3**（`/data-chat`、`/queries/visual`、`/extraction/config`） |
  | ⚠ 命名变更（rename） | 18 | 2 ↓ −16 | **2** |
  | 🔁 需安装重定向（legacy compat） | 8 | 9（+1 devtools） | **9** |
  | ❌ Legacy 缺失于 v2（待决策） | 2 | 1（仅 modeling） | **1** |
  | 🆕 V2 独有（新增 CRUD / 错误页） | 19 | 17 | **17** |

  自动化对账脚本 `scripts/checks/route_parity.py` 已交付，当前输出 **0 undeclared mismatches**。
  `tsc --noEmit` ✅ · vitest 603/603 ✅ · vite build ✅ · route_parity --fail-on-mismatch exit 0 ✅

### § 0.1 对齐动作记录

  **2026-04-21**：v2 路径已全面回归 demo（`tmp/platform-redesign/src/routes.tsx`）约定。

  主要变更：

  | 域 | 变更 | 旧 v2 路径 → 新 v2 路径（= demo 路径） |
  | --- | --- | --- |
  | Data | 数据源提升至 data-center 前缀 | `/datasources` → `/data-center/datasources` |
  | Data | 数据集提升至 data-center 前缀 | `/datasets` → `/data-center/datasets` |
  | Data | 数据集注册对齐三条路径 | `/datasets/new` → `/data-center/datasets/register[/table\|/file]` |
  | Data | 提取任务路径还原连字符 | `/extraction/tasks` → `/extraction-tasks` |
  | Data | 提取配置路径还原 | `/extraction/tasks/new` → `/extraction/config` |
  | Data | 新增 Data Chat | ∅ → `/data-chat` |
  | Queries | 工作台回归顶级 index | `/queries/console`（redirect）→ `/queries`（页面） |
  | Queries | 我的查询还原 | `/queries/saved` → `/queries/my` |
  | Queries | 新增可视化构建 | ∅ → `/queries/visual` |
  | Apps | 应用参数名还原 | `/apps/:id` → `/apps/:code` |
  | Apps | 执行监控还原为顶级路由 | `/apps/:id/instances` → `/executions` |
  | Semantic | 工作台路径还原 | `/semantic/devtools` → `/semantic/workbench` |
  | Semantic | 本体子路由展开（5 个） | `/semantic/ontology/*` → 各独立 Route |
  | Semantic | 新增 Cube 编辑路由 | ∅ → `/semantic/cubes/:name/edit` |

---

## § 1 路由对照表

  表内 77 行覆盖两侧所有路由。status 取值：

  - `✅ aligned` — 路径完全一致
  - `⚠ rename` — 功能对等但路径变更
  - `🔁 redirect` — legacy 兼容重定向（cutover 当日安装）
  - `❌ missing-in-v2` — legacy 功能在 v2 无对应
  - `🆕 v2-only` — v2 新增，legacy 无对应

### 1.1 公共 / 全局

  | # | Legacy 路径 | V2 路径 | Status | 归属域 | 备注 |
  | --- | --- | --- | --- | --- | --- |
  | 1 | `/login` | `/login` | ✅ aligned | — | 已实现 |
  | 2 | `/` | `/` | ✅ aligned | — | 根重定向 → `/dashboard` |
  | 3 | `/dashboard` | `/dashboard` | ✅ aligned | — | 已实现 |
  | 4 | `/*` | `/*` | ✅ aligned | — | 兜底：legacy→dashboard, v2→NotFound |
  | 5 | — | `/forbidden` | 🆕 v2-only | — | 403 页面 |
  | 6 | — | `/not-found` | 🆕 v2-only | — | 404 页面 |

### 1.2 数据域 · Data（W2）

  | # | Legacy 路径 | V2 路径 | Status | 归属域 | 接线状态 | 备注 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 7 | `/data-center` | `/data-center` | ✅ aligned | W2 data | ✅ 已接线（Navigate） | 两侧均重定向到 datasources |
  | 8 | `/data-center/datasources` | `/data-center/datasources` | ✅ aligned | W2 data | ✅ 已接线（Datasources.tsx） | |
  | 9 | — | `/data-center/datasources/:id` | 🆕 v2-only | W2 data | ✅ 已接线（DatasourceDetail.tsx） | 数据源详情 |
  | 10 | `/data-center/datasets` | `/data-center/datasets` | ✅ aligned | W2 data | ✅ 已接线（Datasets.tsx） | |
  | 11 | `/data-center/datasets/:id` | `/data-center/datasets/:id` | ✅ aligned | W2 data | ✅ 已接线（DatasetDetail.tsx） | |
  | 12 | `/data-center/datasets/register` | `/data-center/datasets/register` | ✅ aligned | W2 data | ✅ 已接线（DatasetCreate.tsx） | |
  | 13 | `/data-center/datasets/register/table` | `/data-center/datasets/register/table` | ✅ aligned | W2 data | ✅ 已接线（DatasetCreate.tsx） | |
  | 14 | `/data-center/datasets/register/file` | `/data-center/datasets/register/file` | ✅ aligned | W2 data | ✅ 已接线（DatasetCreate.tsx） | |
  | 15 | `/extraction-tasks` | `/extraction-tasks` | ✅ aligned | W2 data | ✅ 已接线（ExtractionTasks.tsx） | |
  | 16 | — | `/extraction-tasks/:id` | 🆕 v2-only | W2 data | ✅ 已接线（ExtractionTaskDetail.tsx） | 提取任务详情 |
  | 17 | `/extraction/config` | `/extraction/config` | ✅ aligned | W2 data | ⚠️ Placeholder | 无 ExtractionConfig 页面；ExtractionTaskCreate 预期路由为 `/extraction/tasks/new` |
  | 18 | `/extraction/runs` | `/extraction/runs` | ✅ aligned | W2 data | ✅ 已接线（ExtractionRuns.tsx） | |
  | 19 | — | `/extraction/runs/:id` | 🆕 v2-only | W2 data | ✅ 已接线（ExtractionRunDetail.tsx） | 执行记录详情 |
  | 20 | `/data-chat` | `/data-chat` | ✅ aligned | W2 data | ⚠️ Placeholder | 无 DataChat.tsx 页面文件 |

### 1.3 查询域 · Queries（W3）

  | # | Legacy 路径 | V2 路径 | Status | 归属域 | 接线状态 | 备注 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 21 | `/queries` | `/queries` | ✅ aligned | W3 query | ✅ 已接线（QueryConsole.tsx） | 查询工作台主入口 |
  | 22 | `/queries/editor` | `/queries` | ⚠ rename | W3 query | ✅ 已接线（QueryConsole.tsx） | legacy redirect → v2 工作台 index |
  | 23 | `/queries/visual` | `/queries/visual` | ✅ aligned | W3 query | ⚠️ Placeholder | 无 QueriesVisual.tsx 页面文件 |
  | 24 | `/queries/my` | `/queries/my` | ✅ aligned | W3 query | ✅ 已接线（QueriesSaved.tsx） | |
  | 25 | — | `/queries/my/:id` | 🆕 v2-only | W3 query | ✅ 已接线（QueriesSavedDetail.tsx） | 查询详情 |
  | 26 | `/queries/templates` | `/queries/my` | ⚠ rename | W3 query | ✅ 已接线（QueriesSaved.tsx） | legacy redirect → v2 我的查询 |
  | 27 | `/queries/history` | `/queries/history` | ✅ aligned | W3 query | ✅ 已接线（QueryHistory.tsx） | |
  | 28 | — | `/queries/history/:id` | 🆕 v2-only | W3 query | ✅ 已接线（QueryHistoryDetail.tsx） | 历史详情 |
  | 29 | `/queries/scheduled` | `/queries/scheduled` | ✅ aligned | W3 query | ✅ 已接线（QueriesScheduled.tsx，内部 stub） | B-back-8 阻塞中 |
  | 30 | — | `/queries/scheduled/:id` | 🆕 v2-only | W3 query | ✅ 已接线（QueriesScheduledDetail.tsx，内部 stub） | B-back-8 阻塞中 |

### 1.4 应用域 · Apps（W3）

  | # | Legacy 路径 | V2 路径 | Status | 归属域 | 接线状态 | 备注 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 31 | `/apps` | `/apps` | ✅ aligned | W3 apps | ✅ 已接线（Marketplace.tsx） | |
  | 32 | `/apps/:code` | `/apps/:code` | ✅ aligned | W3 apps | ✅ 已接线（AppDetail.tsx） | 参数名统一为 code |
  | 33 | `/executions` | `/executions` | ✅ aligned | W3 apps | ✅ 已接线（executions/Executions.tsx） | |
  | 34 | — | `/executions/:id` | 🆕 v2-only | W3 apps | ✅ 已接线（executions/ExecutionDetail.tsx） | 执行详情 |

### 1.5 语义域 · Semantic（W4）

  | # | Legacy 路径 | V2 路径 | Status | 归属域 | 接线状态 | 备注 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 35 | `/semantic` | `/semantic` | ✅ aligned | W4 semantic | ✅ 已接线（Navigate） | 两侧均重定向到 ontology |
  | 36 | `/semantic/workbench` | `/semantic/workbench` | ✅ aligned | W4 semantic | ✅ 已接线（devtools/DevTools.tsx） | |
  | 37 | `/semantic/ontology` | `/semantic/ontology` | ✅ aligned | W4 semantic | ✅ 已接线（OntologyLayout + Workbench.tsx 为 index） | OntologyLayout 提供二级导航 |
  | 38 | — | `/semantic/ontology/objects` | 🆕 v2-only | W4 semantic | ✅ 已接线（ontology/Objects.tsx） | |
  | 39 | — | `/semantic/ontology/objects/new` | 🆕 v2-only | W4 semantic | ✅ 已接线（ontology/ObjectCreate.tsx） | |
  | 40 | — | `/semantic/ontology/objects/:name` | 🆕 v2-only | W4 semantic | ✅ 已接线（ontology/ObjectDetail.tsx） | |
  | 41 | — | `/semantic/ontology/metrics` | 🆕 v2-only | W4 semantic | ✅ 已接线（ontology/Metrics.tsx） | |
  | 42 | — | `/semantic/ontology/relations` | 🆕 v2-only | W4 semantic | ✅ 已接线（ontology/Relations.tsx） | |
  | 43 | — | `/semantic/ontology/governance` | 🆕 v2-only | W4 semantic | ✅ 已接线（ontology/Governance.tsx） | |
  | 44 | `/semantic/cubes` | `/semantic/cubes` | ✅ aligned | W4 semantic | ✅ 已接线（cubes/Cubes.tsx） | |
  | 45 | `/semantic/cubes/new` | `/semantic/cubes/new` | ✅ aligned | W4 semantic | ✅ 已接线（cubes/CubeCreate.tsx） | |
  | 46 | `/semantic/cubes/:name` | `/semantic/cubes/:name` | ✅ aligned | W4 semantic | ✅ 已接线（cubes/CubeDetail.tsx） | |
  | 47 | `/semantic/cubes/:name/edit` | `/semantic/cubes/:name/edit` | ✅ aligned | W4 semantic | ✅ 已接线（cubes/CubeEdit.tsx） | edit 作为独立子路由保留 |
  | 48 | `/semantic/domains` | `/semantic/domains` | ✅ aligned | W4 semantic | ✅ 已接线（domains/Domains.tsx） | |
  | 49 | `/semantic/domains/:id` | `/semantic/domains/:id` | ✅ aligned | W4 semantic | ✅ 已接线（domains/DomainCanvas.tsx） | |
  | 50 | `/semantic/views/:name` | `/semantic/views/:name` | ✅ aligned | W4 semantic | ✅ 已接线（views/ViewDetail.tsx） | |
  | 51 | `/semantic/devtools` | `/semantic/workbench` | 🔁 redirect | W4 semantic | ✅ 已接线（devtools/DevTools.tsx） | legacy=redirect→workbench |
  | 52 | `/semantic/modeling` | — | ❌ missing-in-v2 | W4 semantic | — | ModelingRedirect；建议 redirect→domains |
  | 53 | `/semantic/overview` | `/semantic/workbench` | 🔁 redirect | W4 semantic | ✅ 已接线（devtools/DevTools.tsx） | |
  | 54 | `/semantic/tools` | `/semantic/workbench` | 🔁 redirect | W4 semantic | ✅ 已接线（devtools/DevTools.tsx） | |
  | 55 | `/semantic/ide` | `/semantic/workbench` | 🔁 redirect | W4 semantic | ✅ 已接线（devtools/DevTools.tsx） | |
  | 56 | `/semantic/playground` | `/semantic/cubes` | 🔁 redirect | W4 semantic | ✅ 已接线（cubes/Cubes.tsx） | |
  | 57 | `/semantic/canvas` | `/semantic/domains` | 🔁 redirect | W4 semantic | ✅ 已接线（domains/Domains.tsx） | |
  | 58 | `/semantic/visual-model` | `/semantic/domains` | 🔁 redirect | W4 semantic | ✅ 已接线（domains/Domains.tsx） | |
  | 59 | `/semantic/visual-model/:id` | `/semantic/domains/:id` | 🔁 redirect | W4 semantic | ✅ 已接线（domains/DomainCanvas.tsx） | |
  | 60 | `/semantic/domains/:id/canvas` | `/semantic/domains/:id` | 🔁 redirect | W4 semantic | ✅ 已接线（domains/DomainCanvas.tsx） | |

### 1.6 配置域 · Config（W5）

  | # | Legacy 路径 | V2 路径 | Status | 归属域 | 接线状态 | 备注 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 61 | `/config` | `/config` | ✅ aligned | W5 config | ✅ 已接线（Navigate） | 两侧都 redirect→channels |
  | 62 | `/config/channels` | `/config/channels` | ✅ aligned | W5 config | ✅ 已接线（channels/Channels.tsx） | |
  | 63 | — | `/config/channels/:id` | 🆕 v2-only | W5 config | ✅ 已接线（channels/ChannelDetail.tsx） | 渠道详情 |
  | 64 | `/config/subscriptions` | `/config/subscriptions` | ✅ aligned | W5 config | ✅ 已接线（subscriptions/Subscriptions.tsx） | |
  | 65 | — | `/config/subscriptions/:id` | 🆕 v2-only | W5 config | ✅ 已接线（subscriptions/SubscriptionDetail.tsx） | 订阅详情 |

---

## § 2 命名差异决议

  2026-04-21 对齐后，剩余 `⚠ rename` 仅 **2 项**（均为 legacy 内部重定向路由，v2 无需实体路由）。

### 2.1 剩余重定向规则表

  | Legacy 路径 | 推荐 V2 最终路径 | 重定向类型 | 说明 |
  | --- | --- | --- | --- |
  | `/queries/editor` | `/queries` | 301 | legacy 是旧版 redirect，v2 工作台直接在 `/queries` |
  | `/queries/templates` | `/queries/my` | 301 | legacy 是旧版 redirect → v2 我的查询 |

### 2.2 Legacy 兼容重定向（来自 §1 的 🔁 redirect）

  共 9 条（+1 `/semantic/devtools`），cutover 后需在 v2 路由表或 nginx 中保留等效规则：

  | Legacy 路径 | V2 重定向目标 | 类型 |
  | --- | --- | --- |
  | `/semantic/devtools` | `/semantic/workbench` | 301 |
  | `/semantic/overview` | `/semantic/workbench` | 301 |
  | `/semantic/tools` | `/semantic/workbench` | 301 |
  | `/semantic/ide` | `/semantic/workbench` | 301 |
  | `/semantic/playground` | `/semantic/cubes` | 301 |
  | `/semantic/canvas` | `/semantic/domains` | 301 |
  | `/semantic/visual-model` | `/semantic/domains` | 301 |
  | `/semantic/visual-model/:id` | `/semantic/domains/:id` | 301 |
  | `/semantic/domains/:id/canvas` | `/semantic/domains/:id` | 301 |

### 2.3 实施方式

  两种方案选其一（建议 A）：

  - **方案 A — 前端路由表**：在 `v2/routes.tsx` 顶部添加 `LEGACY_REDIRECTS` map，用 `<Navigate>` 组件实现。
    优点：零 nginx 配置变更；缺点：需要前端代码加载后才生效。
  - **方案 B — nginx rewrite**：在 nginx server block 中添加 `rewrite ^/data-center/datasources$ /datasources permanent;` 等规则。
    优点：服务端直接 301，SEO 友好；缺点：需 ops 配合。

  重定向表预计 Day+180 后清理（参考 [04-cutover-and-migration.md](04-cutover-and-migration.md) §7）。

---

## § 3 待补 V2 页面清单

  **2026-04-21 接线后更新**：大部分页面已通过 lazy import 接线，以下标注当前真实状态。
  `✅` = 已接线真实组件；`⚠️` = 仍为 Placeholder（无对应页面文件）；`🔧` = 文件存在但内部为 stub（B-back-X 阻塞）。

  以下路由在 `v2/routes.tsx` 中仍使用 `<Placeholder>` 占位，需要域 agent 在对应 sprint 实现真实页面。

### 3.1 数据域（W2 · data-agent）

  | V2 路径 | 页面 | 对应后端契约 | 优先级 | 接线状态 |
  | --- | --- | --- | --- | --- |
  | `/data-center/datasources` | DatasourcesList | `GET /api/v1/data-center/datasources` | P15/P16 | ✅ Datasources.tsx |
  | `/data-center/datasources/:id` | DatasourceDetail | `GET /api/v1/data-center/datasources/:id` | P15/P16 | ✅ DatasourceDetail.tsx |
  | `/data-center/datasets` | DatasetsList | `GET /api/v1/data-center/datasets` | — | ✅ Datasets.tsx |
  | `/data-center/datasets/:id` | DatasetDetail | `GET /api/v1/data-center/datasets/:id` | P3 | ✅ DatasetDetail.tsx |
  | `/data-center/datasets/register` | DatasetCreate | `POST /api/v1/data-center/datasets` | P3 | ✅ DatasetCreate.tsx |
  | `/data-center/datasets/register/table` | DatasetCreate | `POST /api/v1/data-center/datasets` | P3 | ✅ DatasetCreate.tsx |
  | `/data-center/datasets/register/file` | DatasetCreate | `POST /api/v1/data-center/datasets` | P3 | ✅ DatasetCreate.tsx |
  | `/extraction-tasks` | ExtractionTasksList | `GET /api/v1/extraction/tasks` | P10 | ✅ ExtractionTasks.tsx |
  | `/extraction-tasks/:id` | ExtractionTaskDetail | `GET /api/v1/extraction/tasks/:id` | P10/P17 | ✅ ExtractionTaskDetail.tsx |
  | `/extraction/config` | ExtractionConfig | `POST /api/v1/extraction/tasks` | P10 | ⚠️ Placeholder（无页面文件；ExtractionTaskCreate.tsx 预期路由为 `/extraction/tasks/new`） |
  | `/extraction/runs` | ExtractionRunsList | `GET /api/v1/extraction/runs` | P17/P18 | ✅ ExtractionRuns.tsx |
  | `/extraction/runs/:id` | ExtractionRunDetail | `GET /api/v1/extraction/runs/:id` | P17/P18 | ✅ ExtractionRunDetail.tsx |
  | `/data-chat` | DataChat | — | — | ⚠️ Placeholder（无 DataChat.tsx 页面文件） |

### 3.2 查询域（W3 · query-agent）

  | V2 路径 | 页面 | 对应后端契约 | 优先级 | 接线状态 |
  | --- | --- | --- | --- | --- |
  | `/queries` | QueryConsole | `POST /api/v1/queries/execute` | P9 | ✅ QueryConsole.tsx |
  | `/queries/visual` | QueriesVisual | — | — | ⚠️ Placeholder（无 QueriesVisual.tsx 页面文件） |
  | `/queries/my` | QueriesSaved | `GET /api/v1/queries` | — | ✅ QueriesSaved.tsx |
  | `/queries/my/:id` | QueriesSavedDetail | `GET /api/v1/queries/:id` | — | ✅ QueriesSavedDetail.tsx |
  | `/queries/history` | QueryHistory | `GET /api/v1/queries/histories` | P9 | ✅ QueryHistory.tsx |
  | `/queries/history/:id` | QueryHistoryDetail | `GET /api/v1/queries/histories` | P9 | ✅ QueryHistoryDetail.tsx |
  | `/queries/scheduled` | QueriesScheduled | `GET /api/v1/queries/scheduled` | B-back-8 | 🔧 QueriesScheduled.tsx（内部 stub，B-back-8 阻塞） |
  | `/queries/scheduled/:id` | QueriesScheduledDetail | `GET /api/v1/queries/scheduled/:id` | B-back-8 | 🔧 QueriesScheduledDetail.tsx（内部 stub，B-back-8 阻塞） |

### 3.3 应用域（W3 · apps-agent）

  | V2 路径 | 页面 | 对应后端契约 | 优先级 | 接线状态 |
  | --- | --- | --- | --- | --- |
  | `/apps` | AppsMarketplace | `GET /api/v1/apps` | P20 | ✅ Marketplace.tsx |
  | `/apps/:code` | AppDetail | `GET /api/v1/apps/:code` | P20 | ✅ AppDetail.tsx |
  | `/executions` | Executions | `GET /api/v1/app-executions` | P1/P22 | ✅ executions/Executions.tsx |
  | `/executions/:id` | ExecutionDetail | `GET /api/v1/app-executions/:id` | P1/P22 | ✅ executions/ExecutionDetail.tsx |

### 3.4 语义域（W4 · semantic-agent）

  | V2 路径 | 页面 | 对应后端契约 | 优先级 | 接线状态 |
  | --- | --- | --- | --- | --- |
  | `/semantic/ontology` | OntologyWorkbench | `GET /api/v1/ontology/workbench/objects` | P4-P7/P19 | ✅ ontology/Workbench.tsx（含 OntologyLayout wrapper） |
  | `/semantic/ontology/objects` | OntologyObjects | `GET /api/v1/ontology/objects` | P4-P7/P19 | ✅ ontology/Objects.tsx |
  | `/semantic/ontology/objects/new` | ObjectCreate | `POST /api/v1/ontology/objects` | P4-P7/P19 | ✅ ontology/ObjectCreate.tsx |
  | `/semantic/ontology/objects/:name` | ObjectDetail | `GET /api/v1/ontology/objects/:name` | P4-P7/P19 | ✅ ontology/ObjectDetail.tsx |
  | `/semantic/ontology/metrics` | OntologyMetrics | `GET /api/v1/ontology/metrics` | P4-P7/P19 | ✅ ontology/Metrics.tsx |
  | `/semantic/ontology/relations` | OntologyRelations | `GET /api/v1/ontology/relations` | P4-P7/P19 | ✅ ontology/Relations.tsx |
  | `/semantic/ontology/governance` | OntologyGovernance | `GET /api/v1/ontology/governance` | P4-P7/P19 | ✅ ontology/Governance.tsx |
  | `/semantic/workbench` | DevTools | `POST /api/v1/semantic/diagnose` | B-back-9 | ✅ devtools/DevTools.tsx |
  | `/semantic/cubes` | SemanticCubes | `GET /api/v1/semantic/cubes` | B-back-7 | ✅ cubes/Cubes.tsx |
  | `/semantic/cubes/new` | SemanticCubeCreate | `POST /api/v1/semantic/cubes` | — | ✅ cubes/CubeCreate.tsx |
  | `/semantic/cubes/:name` | SemanticCubeDetail | `GET /api/v1/semantic/cubes/:name` | — | ✅ cubes/CubeDetail.tsx |
  | `/semantic/cubes/:name/edit` | SemanticCubeEdit | `PUT /api/v1/semantic/files/cubes/:name` | — | ✅ cubes/CubeEdit.tsx |
  | `/semantic/views/:name` | SemanticViewDetail | `GET /api/v1/semantic/views/:name` | P8/P11 | ✅ views/ViewDetail.tsx |
  | `/semantic/domains` | SemanticDomains | `GET /api/v1/semantic/domains` | — | ✅ domains/Domains.tsx |
  | `/semantic/domains/:id` | SemanticDomainCanvas | `GET /api/v1/semantic/domains/:name/canvas` | — | ✅ domains/DomainCanvas.tsx |

### 3.5 配置域（W5 · config-agent）

  | V2 路径 | 页面 | 对应后端契约 | 优先级 | 接线状态 |
  | --- | --- | --- | --- | --- |
  | `/config/channels` | ConfigChannels | `GET /api/v1/channels` | P12 | ✅ channels/Channels.tsx |
  | `/config/channels/:id` | ConfigChannelDetail | `GET /api/v1/channels/:id` | P12 | ✅ channels/ChannelDetail.tsx |
  | `/config/subscriptions` | ConfigSubscriptions | `GET /api/v1/subscriptions` | P13 | ✅ subscriptions/Subscriptions.tsx |
  | `/config/subscriptions/:id` | ConfigSubscriptionDetail | `GET /api/v1/subscriptions/:id` | P13 | ✅ subscriptions/SubscriptionDetail.tsx |
  | `/config/users` | ConfigUsers | `GET /api/v1/users` | P14/P21 | — 无路由，后端 `/api/v1/users` 未实现 |
  | `/config/roles` | ConfigRoles | `GET /api/v1/roles` | P14 | — 无路由，后端 `/api/v1/roles` 未实现 |

---

## § 4 V2-only 页面清单

  以下路由在 v2 路由表中存在但 legacy 无对应。大部分是合理的新增 CRUD（detail / create），
  少数需要后端拓展。

### 4.1 正常新增（后端已支持或即将支持）

  | V2 路径 | 说明 | 状态 |
  | --- | --- | --- |
  | `/datasources/new` | 新建数据源 | 后端 `POST /datasources` 已有 |
  | `/datasources/:id` | 数据源详情 | 后端 `GET /datasources/:id` 已有 |
  | `/extraction/tasks/:id` | 提取任务详情 | 后端已有 |
  | `/extraction/runs/:id` | 执行记录详情 | 后端已有 |
  | `/queries/console` | 查询控制台 | `POST /queries/execute` 已有 |
  | `/queries/history/:id` | 查询历史详情 | 后端已有 |
  | `/queries/saved` | 已保存查询列表 | 后端已有 |
  | `/queries/saved/new` | 新建已保存查询 | 后端已有 |
  | `/queries/saved/:id` | 已保存查询详情 | 后端已有 |
  | `/queries/scheduled/new` | 新建调度查询 | B-back-8 新建中 |
  | `/queries/scheduled/:id` | 调度查询详情 | B-back-8 新建中 |
  | `/apps/:id/instances` | 应用实例列表 | 后端 `GET /app-instances` 已有 |
  | `/apps/:id/instances/:instanceId` | 应用实例详情 | 后端已有 |
  | `/config/channels/new` | 新建渠道 | 后端已有 |
  | `/config/channels/:id` | 渠道详情 | 后端已有 |
  | `/config/subscriptions/new` | 新建订阅 | 后端已有 |
  | `/config/subscriptions/:id` | 订阅详情 | 后端已有 |
  | `/forbidden` | 403 页面 | 纯前端 |
  | `/not-found` | 404 页面 | 纯前端 |

### 4.2 需后端拓展

  | V2 路径 | 后端需求 | 计划 |
  | --- | --- | --- |
  | `/config/users` | 需 `GET /api/v1/users` 列表 + RBAC 字段 | B-back-1 / P14 / P21 |
  | `/config/roles` | 需 `GET /api/v1/roles` 列表 + 权限矩阵 | P14；若后端不排期则 W5 前标记删除 |

---

## § 5 Cutover 当日动作清单

  以下为 Day 0 从 `main.tsx` 切换到 `v2/routes.tsx` 时的最小必做动作列表。
  格式遵循 [04-cutover-and-migration.md](04-cutover-and-migration.md) §3 Day 0 runbook。

### 5.1 前置（D -1 确认）

  - [ ] 所有 `<Placeholder>` 已替换为真实页面组件（剩余 3 个有意保留：`/data-chat`、`/queries/visual`、`/extraction/config`）
  - [x] 路由对账脚本通过：`python scripts/checks/route_parity.py --fail-on-mismatch` 退出码 0 ✅ (2026-04-21)
  - [x] TypeScript 编译通过：`cd frontend && npx tsc --noEmit` ✅ (2026-04-21)
  - [x] Vitest 全绿：603/603 tests passed ✅ (2026-04-21)
  - [ ] E2E 烟雾测试覆盖 5 大模块

### 5.2 Day 0 步骤

  | 顺序 | 动作 | 命令 / 操作 | 验证 |
  | --- | --- | --- | --- |
  | 1 | 安装重定向表 | 在 `v2/routes.tsx` 顶部添加 §2 的 `LEGACY_REDIRECTS` map + 对应 `<Navigate>` 路由（共 26 条） | 脚本 `route_parity.py` 通过 |
  | 2 | 切换入口 | `main.tsx` 中 `import App from './App'` → `import AppRoutes from './v2/routes'` | `tsc --noEmit` 通过 |
  | 3 | 更新 HTML title / favicon | 如有品牌变更一并切换 | 人工确认 |
  | 4 | 部署 | `./scripts/deploy.sh frontend --tag v2.0.0` | nginx 返回 v2 产物 |
  | 5 | 烟雾测试 | `npx playwright test e2e:smoke` + 人工走查 | 全绿 |
  | 6 | 公告 | 发送"切换完成"通知 | — |

### 5.3 回滚触发

  任一条件触发立即回滚（详见 [04-cutover-and-migration.md](04-cutover-and-migration.md) §5）：

  - 烟雾测试任一项失败且 15 分钟内无法热修
  - 5xx 比例 > 5%（持续 5 分钟）
  - 用户登录失败率 > 10%

---

## § 6 自动化对账

### 6.1 脚本

  - 路径：`scripts/checks/route_parity.py`
  - 依赖：Python 3.10+ stdlib only
  - 输入：`frontend/src/App.tsx` + `frontend/src/v2/routes.tsx`
  - 输出：JSON 或文本报告

### 6.2 本地运行

  ```bash
  # 文本报告
  python scripts/checks/route_parity.py

  # JSON 报告
  python scripts/checks/route_parity.py --json

  # CI gate（有未声明差异时 exit 1）
  python scripts/checks/route_parity.py --fail-on-mismatch
  ```

### 6.3 CI 集成（建议）

  在 `.github/workflows/ci.yml` 的 `test` job 中添加：

  ```yaml
  - name: Route parity check
    run: python scripts/checks/route_parity.py --fail-on-mismatch
  ```

  当域 agent 新增路由时，须同步更新脚本内 allowlist，否则 CI 将失败。

---

## 交叉引用

  - [Master Plan · 2026-04-20-platform-redesign-rollout-implementation.md](../2026-04-20-platform-redesign-rollout-implementation.md) — 总体计划与里程碑
  - [04 · Cutover and Migration](04-cutover-and-migration.md) — 切换日 runbook、回滚剧本、前置条件 checklist
  - [Round 1 执行报告](round1-execution-report.md) — Round 1 交付成果与风险
  - [01 · Frontend Workstream](01-frontend-workstream.md) — P1~P22 覆盖审计与路由规范
